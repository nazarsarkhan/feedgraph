# FeedGraph — News Intelligence Hub

An RSS aggregator that builds a knowledge graph from news articles using LLMs to extract entities, classify content along user-defined axes, deduplicate across sources, and surface relationships as a navigable graph.

---

## Quick Start

### Prerequisites

- Docker + Docker Compose
- (Optional) OpenAI or Anthropic API key for live LLM processing — the demo runs end-to-end without one

### Run with demo data

```bash
git clone <repo>
cd feedgraph
cp .env.example .env
docker compose up -d
```

Open **http://localhost:8080**

| Field    | Value                  |
|----------|------------------------|
| Email    | `demo@feedgraph.local` |
| Password | `demo123456`           |

The demo dataset seeds automatically on first boot: **6 feeds, 26 articles** across every pipeline state (`processed`, `filtered`, `pending_llm`), **15 cross-mentioned entities**, and **2 cross-source duplicate clusters** demonstrating the "N similar in other sources" counter. The default `LLM_ACTIVE_PROVIDER=mock` means no API keys are required to exercise the full pipeline.

### Run with live LLM processing

Add to `.env`:

```bash
LLM_ACTIVE_PROVIDER=openai              # or anthropic
OPENAI_API_KEY=sk-...                   # if using openai
ANTHROPIC_API_KEY=sk-ant-...            # if using anthropic
LLM_FAILOVER_PROVIDER=anthropic         # optional, see ADRs
```

Restart the backend (`docker compose up -d --force-recreate backend`), then add a real RSS feed via the **Feeds** page and click **Poll now**.

### Queue monitoring (Bull Board)

http://localhost:3030 — basic-auth from `USER_LOGIN` / `USER_PASSWORD` in `.env` (defaults: `admin` / `changeme`).

### Reset to a clean state

```bash
docker compose down -v   # wipes postgres + redis volumes
docker compose up -d     # re-seeds on first boot
```

The seed is **idempotent** at the user level — once `demo@feedgraph.local` exists, the seed silently no-ops. To see fixture changes (e.g. after pulling new commits that extend the seed), the volume wipe above is the canonical way to refresh.

---

## Stack

| Layer        | Technology                                                       |
|--------------|------------------------------------------------------------------|
| Backend      | NestJS 11 · TypeORM 1.0 · PostgreSQL 16 · zod v4 · argon2id      |
| Queue        | BullMQ + Redis 7 (cron via `@nestjs/schedule`)                   |
| LLM          | OpenAI `gpt-4o-mini` · Anthropic `claude-haiku-4-5` · Mock       |
| Frontend     | React 18 · Vite · Tailwind · shadcn/ui · TanStack Query · React Router 6 |
| Graph        | `@xyflow/react` v12                                              |
| Charts       | `recharts`                                                       |
| Serving      | nginx (single-origin reverse proxy + SPA fallback)               |
| Container    | Docker Compose (postgres · redis · backend · frontend · bull-board) |

---

## Architecture

### Pipeline

```
RSS feed
  └─ FEED_POLL (cron + manual) ────► feed-poll worker ──► articles (status=raw)
                                          │
                                          ▼
                              ARTICLE_PREFILTER (BullMQ)
                                          │
                                  ┌───────┴───────┐
                                  │               │
                          (rule fires)         (passes)
                                  │               │
                              status=filtered     │
                              + filter_reason     ▼
                                          ARTICLE_PROCESS (BullMQ)
                                                  │
                                                  ▼
                                      LLM Analysis (cache → semaphore →
                                       primary adapter → failover → revalidate)
                                                  │
                                                  ▼
                                    DataSource.transaction:
                                      • entity find-or-create + link
                                      • article_categories link
                                      • article_axis_values link
                                      • UPDATE article (summary, importance, status)
                                                  │
                                  ┌───────────────┴───────────────┐
                                  │                               │
                          importance='junk'                  high / normal
                                  │                               │
                              status=filtered                  status=processed
                              + filter_reason='llm_junk'         (visible in graph)
```

### Key patterns

- **Multi-tenant isolation at the service layer.** Every per-user method takes `userId` as the first param and every WHERE clause filters on `user_id`. Cross-tenant access returns **404**, never 403, so we don't acknowledge that other users' resources exist.
- **HTTP read-only / workers own state.** ArticlesController is read-only with one documented exception (`POST /articles/regenerate`). Article status transitions belong to the worker pipeline.
- **Postgres-native dedup.** `ON CONFLICT DO NOTHING` on `(user_id, url_normalized)` for articles, on `(user_id, lower(canonical_name), type)` for entities. `result.raw.length` (not `result.identifiers.length`) decides inserted-vs-skipped.
- **LLM abstraction is hand-written.** Three adapters (OpenAI / Anthropic / Mock) behind one `LlmService` interface; provider via env; per-call failover; structured output validated by zod twice (adapter + service). Cache keyed by `(content_hash, operation, model)`. Telemetry rows written on every call including cache hits. Per-process semaphore caps concurrency.
- **Prompts live in `@feedgraph/shared`.** Adapters carry only transport — prompt text is business logic. Shared emits CommonJS so the backend's `require()` resolves through the workspace symlink.
- **Mock is first-class.** A fresh clone runs end-to-end without any LLM API key. Switching providers exercises a real call because the cache key includes `model`.

### Project layout

```
feedgraph/
├── README.md                       you are here
├── PLAN.md                         scope, ADRs, and tech debt (working doc)
├── docker-compose.yml              5 services
├── .env / .env.example             single source of config
└── packages/
    ├── shared/                     @feedgraph/shared — zod schemas + prompts
    ├── frontend/                   React + Vite + Tailwind + shadcn
    └── backend/                    NestJS
        └── src/
            ├── auth/               JWT in HttpOnly cookie, email confirm, argon2
            ├── users/ feeds/ categories/ axes/ articles/ entities/
            ├── prefilter/ articles/process/   pipeline workers
            ├── llm/                adapter interface + cache + telemetry + service
            ├── graph-entities/     entity dedup + graph endpoint
            ├── database/seeds/     idempotent demo data
            └── config/env.schema.ts  zod-validated env with conditional API-key checks
```

---

## Architectural decisions

Full ADRs (Context / Decision / Alternatives / Trade-offs format) live in [PLAN.md](./PLAN.md). The most load-bearing ones for review:

| Area              | Decision                                                                                                                 |
|-------------------|---------------------------------------------------------------------------------------------------------------------------|
| Backend framework | **NestJS** over Directus — module system + DI + per-request guards align with the multi-tenant contract                  |
| Persistence       | **TypeORM** over Prisma — JSONB columns, hand-written migrations, raw SQL where needed (correlated subqueries, `WITH ORDINALITY`) |
| Migrations        | **Hand-written**, not `migration:generate` output — diffs reflect intent, not autogenerated noise                         |
| Auth              | **JWT in HttpOnly cookie**, SameSite=Lax — no `Authorization` header, no token-in-localStorage XSS surface                 |
| Pre-filter        | **Deterministic rules in code**, thresholds in env — `missing_title`, `content_too_short`, `clickbait_title`, `high_link_density` |
| LLM cost control  | Per-call **token cap**, in-process **semaphore**, **Postgres-keyed cache** by `(content_hash, operation, model)`. Telemetry rows on cache hits too. |
| LLM provider failover | **Per-call** failover with structured logs — primary → failover on any error. Circuit breaker tracked as tech debt.    |
| Entity dedup      | **Deterministic now** (`lower(canonical_name)` + type), **LLM fuzzy `matchEntities` deferred** — schema is in place via `aliases` JSONB; method exists on the interface but throws NotImplemented. |
| Article dedup     | **Postgres-native** `ON CONFLICT DO NOTHING` on `(user_id, url_normalized)`; "N similar" counter via `GROUP BY content_hash`. |
| Graph endpoint    | **One round trip** returning `{nodes, edges}`. `ae2.entity_id > ae1.entity_id` collapses unordered pairs.                  |
| Graph layout      | **Circle layout** (deterministic, no extra deps) — node size by mentionCount, edge weight by co-mention frequency. Force-directed deferred. |
| Regenerate        | **Single bulk UPDATE** with two-step inline confirmation. Documented exception to "articles are read-only over HTTP."     |

---

## Scope status (per spec section 4)

**Must (acceptance-blocking).** Complete except for two honestly partial items:
- Full LLM fuzzy `matchEntities` (currently deterministic-only).
- README + final cleanup (this commit).

**Should (heavily scored).** Provider failover, demo seed, graph rendering, settings UI, entity timeline, article similarity counter — done. Unit tests, period digests, extended graph filters, LLM telemetry dashboard — tech debt.

**Could.** None of these are in scope for the milestone; they're tracked as tech debt for reference.

The full Must/Should/Could checklist with current status lives in [PLAN.md](./PLAN.md) at the top.

---

## Development

### Frontend dev with HMR (host Vite, Dockerised stack)

```bash
docker compose up -d postgres redis backend bull-board
cd packages/frontend && npm run dev
```

Vite serves the SPA at http://localhost:5173 and proxies `/api/*` to the backend on `localhost:3000`. The frontend doesn't see the difference between the Vite proxy and the production nginx proxy.

### Backend dev outside Docker

```bash
docker compose up -d postgres redis
npm run start:dev -w @feedgraph/backend
```

Hand-running the seed CLI:

```bash
docker compose exec backend npm run seed:demo
# or, against a host-reachable Postgres:
npm run seed:demo:dev -w @feedgraph/backend
```

### Lint / format / type-check

```bash
npm run lint
npm run lint:fix
npm run format
npm run format:check
npm run build       # builds shared first (CommonJS), then backend
```

### Migrations (hand-written, TypeORM CLI)

```bash
npm run migration:run     -w @feedgraph/backend
npm run migration:revert  -w @feedgraph/backend
```

Generate scaffolding only (then rewrite by hand per the ADR):

```bash
npm run migration:generate -w @feedgraph/backend -- src/database/migrations/NewName
```

---

## Notes for reviewers

- **No API keys are required** to exercise the full pipeline. The default `LLM_ACTIVE_PROVIDER=mock` produces deterministic, schema-valid analyses keyed off the article content hash.
- **The mock adapter is first-class**, not a stub — it returns real summaries (extracted from the article body), real entities (named via the deterministic hash), and real axis classifications. The cache stores them with `model="mock"` so flipping to OpenAI/Anthropic produces fresh, real calls.
- **Cross-tenant access returns 404, not 403.** Don't read this as a bug — it's documented as a security property (we don't acknowledge existence of other users' resources).
- **The graph reads from `entities` and `article_entities`**, not `article.status`. Triggering "Reclassify articles" from Settings doesn't empty the graph mid-cycle.
- **No `LLM_ACTIVE_PROVIDER=openai` without `OPENAI_API_KEY`** — the env schema's `superRefine` rejects this at boot. Same for Anthropic.
- For a guided walkthrough of the data model, queues, and adapter wiring, the per-section docs in [PLAN.md](./PLAN.md) under "Architectural decisions" are the most efficient read.
