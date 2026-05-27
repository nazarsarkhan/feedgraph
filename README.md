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

Full ADRs (Context / Decision / Alternatives / Trade-offs format) live in [PLAN.md](./PLAN.md). The ones below are the load-bearing decisions for review, grouped into the five required by the spec and the rest.

### Required by spec

#### ADR-1: Split between deterministic code and LLM (Principle 1)

**Context.** The spec's Principle 1 states "LLM is a point tool, not a universal aggregator". The naive shape is to route everything through an LLM and let it figure out what matters. The right shape is to be explicit about which layer owns which job.

**Decision.** A strict boundary between deterministic code and LLM calls. Deterministic: RSS parsing, URL normalization (tracking-param stripping, host lowercasing, trailing-slash handling), content deduplication (`content_hash`, `url_normalized`), heuristic pre-filter (content length, link density, clickbait patterns), entity dedup by case-insensitive canonical name, and every HTTP CRUD operation. LLM-only: per-article summary, entity extraction, content classification (importance, categories, axes). Every LLM call has a typed zod schema and a single named purpose. No "let the LLM figure it out" shortcuts.

**Trade-offs.** The deterministic layer can't catch novel junk shapes it wasn't designed for (a clickbait pattern we haven't seen). The upside is that deterministic code is testable, fast, free, and re-runs cheaply.

#### ADR-2: Entity deduplication strategy

**Context.** The LLM returns surface forms — "Microsoft", "MSFT", "Microsoft Corp." — that should collapse to one entity node. The question is how aggressively to dedupe and at which stage.

**Decision.** Two phases. Phase 1 (implemented): deterministic uniqueness on `(user_id, lower(canonical_name), type)`. Same name + type from different articles reuse the same row. Phase 2 (deferred): an LLM-powered `matchEntities` operation that merges surface variants into the `aliases` JSONB column already provisioned on the entity row. The schema is ready; the operation throws `NotImplementedException`. The demo seed populates two aliases by hand (`CF` → Cloudflare, `ANTH` → Anthropic) so the column is visibly used.

**Trade-offs.** Until `matchEntities` lands, surface-form variants appear as separate nodes — explicitly tracked as PARTIAL in the Must checklist. The Phase-1 deterministic rule is intentionally conservative (no Levenshtein, no trigram) so we don't false-merge cases like TypeScript / JavaScript before a review path exists.

#### ADR-3: Cost control and LLM caching

**Context.** LLM calls cost real money. A system that calls an LLM for every article on every re-poll is expensive fast. Three independent levers exist: limit what gets called, limit how much each call costs, cache results.

**Decision.** Four cost controls, all env-tunable:
1. **Heuristic pre-filter** runs before any LLM call — roughly 30% of articles are dropped deterministically at zero cost.
2. **Token cap** via `LLM_MAX_TOKENS_PER_REQUEST` (default 4000) on completion tokens; the prompt builder also truncates article content at 12k chars as input-side protection.
3. **Postgres result cache** keyed by `(content_hash, operation, model)` — identical content never costs a second LLM call regardless of user or re-poll count. Cache never expires (content-hash determinism makes the output valid forever for the same input).
4. **In-process concurrency semaphore** via `LLM_CONCURRENCY` (default 3) prevents thundering-herd token spend during bulk reprocessing.

Telemetry rows are written on every call **including cache hits**, so the "tokens saved by cache" metric is queryable directly out of `llm_telemetry`.

**Trade-offs.** The cache has no TTL or eviction. If a prompt changes, cached entries for the old prompt stay valid until manually deleted. Acceptable: prompt changes are code changes that go through review and intentional cache clearing.

#### ADR-4: LLM provider error handling strategy

**Context.** LLM providers fail. Keys expire, rate limits get hit, networks blip. The system needs to degrade gracefully rather than stalling the whole article-processing pipeline.

**Decision.** Two tiers of resilience. **Tier 1** — Provider failover: `LlmService` accepts a primary and an optional secondary adapter (`LLM_FAILOVER_PROVIDER`). On a retriable error from the primary (5xx, 429, 401/403, network failures), it immediately tries the secondary. Error classification is provider-specific — adapters wrap their errors in a single `LlmRetriableError` class. 401/403 are retriable because each provider has independent credentials; 400/404/422 are NOT retriable because they indicate a request-shape fault that would repeat on any provider. **Tier 2** — BullMQ retries: if both providers fail, the job retries with exponential backoff. Articles stay in `pending_llm`; no row is corrupted.

**Trade-offs.** During a sustained primary outage every job pays one failed-primary RTT (~200–500ms) before the secondary responds. A circuit breaker would amortize that and is tracked as tech debt. Verified live in development: invalid `OPENAI_API_KEY` + valid `ANTHROPIC_API_KEY` produces the expected telemetry pair (`openai/success=false` followed by `anthropic/success=true, failover_from=openai`).

#### ADR-5: Backend framework choice (NestJS over Directus)

**Context.** The spec lists "NestJS or Directus" as the backend option. Both are TypeScript-first Node frameworks. The choice shapes the entire backend architecture.

**Decision.** NestJS. Four reasons:
1. Directus is a headless CMS — it gives CRUD for free but makes custom business logic (BullMQ workers, the LLM pipeline, complex graph queries) awkward to place. Our system **is** the business logic, not the data shell around it.
2. NestJS's module/provider/decorator system maps cleanly onto the pipeline stages (`FeedsModule`, `PrefilterModule`, `LlmModule`, `ArticlesModule` → `process/`, `GraphEntitiesModule`, etc.). Each stage's wiring stays local.
3. First-class BullMQ integration (`@nestjs/bullmq`), cron (`@nestjs/schedule`), and config validation (`@nestjs/config` + zod) — exactly the building blocks the pipeline needs.
4. Production-shape APIs are what reviewers and operators expect to read; NestJS controllers + guards + DTOs are the recognisable shape.

**Trade-offs.** NestJS costs more initial scaffolding than Directus's zero-config CRUD. We paid that cost in the first commits; every subsequent commit benefits from the module isolation.

---

### Additional decisions

#### Database choice (PostgreSQL 16)

**Context.** The spec lists Postgres or MySQL. Our model has JSONB columns (entity `aliases`, `llm_cache.result_json`), needs `pg_trgm` for the deferred fuzzy entity-match step, and uses several Postgres-specific patterns (self-join with `ae2.entity_id > ae1.entity_id` for co-mention edges, `DATE_TRUNC` for timeline aggregation, `gen_random_uuid()` for primary keys).

**Decision.** PostgreSQL 16. JSONB for structured-but-flexible data, UUID PKs via `gen_random_uuid()`, `ON CONFLICT DO NOTHING` for idempotent dedup writes, `DATE_TRUNC` + correlated subqueries for the mention-timeline endpoint. Database-coupling is intentional — we're not abstracting the storage layer.

**Trade-offs.** Postgres-specific features mean the codebase can't trivially switch databases. Acceptable — the abstraction we'd lose isn't free, and the features we use aren't optional.

#### Graph storage model (relational link table, not a graph DB)

**Context.** The entity-relationship graph could be stored as (a) a relational link table (`article_entities`), (b) a dedicated graph database (Neo4j), or (c) JSONB arrays on article rows.

**Decision.** Relational link table — `article_entities (article_id, entity_id, created_at)` with composite PK. Co-mention edges are computed on demand via a self-join (`ae1 JOIN ae2 ON ae1.article_id = ae2.article_id AND ae2.entity_id > ae1.entity_id`). No graph database.

**Trade-offs.** The self-join is O(mentions²) per article. At ≤10 entities/article (LLM cap) and ≤1000 articles, this is microseconds. A materialized `entity_co_mentions` view is the upgrade path if it ever appears in slow logs — tracked as tech debt.

#### Multi-tenant isolation approach

**Context.** Every resource in the system (feeds, articles, entities, categories, axes, LLM telemetry) belongs to a single user. Two enforcement points are possible: at the controller (filter the request scope) or at the service (filter the SQL).

**Decision.** Service layer. Every per-user method takes `userId` as its first parameter and every WHERE clause filters on `user_id`. Each multi-tenant service carries a marker comment explaining the contract. Cross-tenant access returns **404**, never 403, so we don't leak the existence of other users' resources. Pipeline workers (`feed-poll`, `prefilter`, `article-process`) run system-wide; tenancy is enforced at enqueue time, and the article row's `user_id` is the single source of truth downstream.

**Trade-offs.** Controllers can't be the only line of defense — a future bug in a controller can't accidentally expose another user's row, because the service layer would still 404. The cost is that every service method threads `userId` explicitly; for a CRUD-shaped system this is normal.

#### Persistence layer (TypeORM over Prisma)

**Context.** TypeORM and Prisma are the two mainstream choices for TypeScript ORMs on Postgres. The project needs JSONB columns, raw SQL for graph queries (self-joins, correlated subqueries), and hand-written migrations.

**Decision.** TypeORM. Reasons: native JSONB column support, easy escape to raw SQL via `createQueryBuilder` / `query()`, hand-written migrations are first-class (not generated-only), and NestJS's `@nestjs/typeorm` integrates cleanly with the module/DI system.

**Trade-offs.** TypeORM's type safety on `getRawMany()` is weaker than Prisma's — we cast the result shape ourselves. Acceptable; the raw queries are explicit enough that the cast is one extra type assertion.

#### Migrations are hand-written, not generated

**Context.** TypeORM's CLI can generate migrations by diffing the current schema against entity metadata. The generated SQL is often noisy (renames into add+drop, ordering quirks) and the diff doesn't capture intent.

**Decision.** Hand-written DDL. `migration:generate` is used at most as a starting point and rewritten by hand before commit. Status fields are real Postgres `enum` types (not `varchar`), indexes are documented inline, and `ON DELETE` semantics are explicit.

**Trade-offs.** Slightly more typing per schema change. The upside is that any reviewer can read a migration top-to-bottom and understand what it does.

#### Auth — JWT in HttpOnly cookie, no Authorization header

**Context.** Two common JWT delivery models: `Authorization: Bearer <token>` (client manages the token, vulnerable to XSS via localStorage) or HttpOnly cookie (browser manages it, immune to XSS but needs CSRF mitigation).

**Decision.** HttpOnly cookie. SameSite=Lax for development, `Secure` gated on `NODE_ENV=production`. Cookie `maxAge` and JWT `exp` are both derived from `JWT_EXPIRATION` via the `ms` package (the same parser `@nestjs/jwt` uses internally) so they can't drift apart. Email confirmation token is 32-byte random hex; passwords are hashed with argon2id.

**Trade-offs.** SameSite=Lax + same-origin frontend in dev gives acceptable CSRF risk for the milestone; production needs a CSRF token (double-submit or per-form synchronizer), tracked as tech debt.

#### Pre-filter rules in code, thresholds in env

**Context.** The heuristic pre-filter needs to evolve as we see new junk shapes. Rules can live in code (compiled, testable, version-controlled) or in data (database-driven, runtime-tunable).

**Decision.** Rules in code, thresholds in env. The four rules — `missing_title`, `content_too_short`, `clickbait_title`, `high_link_density` — are TypeScript predicates in `PREFILTER_RULES`. The thresholds (`PREFILTER_MIN_CONTENT_LENGTH`, `PREFILTER_MAX_LINK_DENSITY`) are env-driven. A rule rename or addition is a code change; threshold tuning is a config change.

**Trade-offs.** Adding a rule requires a deployment. Acceptable — the rule set is stable and the cost is one PR.

#### Article dedup is Postgres-native, decided by `result.raw.length`

**Context.** Articles arrive from multiple feeds and we need to know whether a row was inserted or skipped due to conflict. TypeORM's `.orIgnore()` reports `result.identifiers` as populated regardless of whether the conflict skipped the row.

**Decision.** `ON CONFLICT DO NOTHING` on the composite unique index `(user_id, url_normalized)`. URL normalization strips tracking params (utm_*, fbclid, gclid), lowercases the host, and drops trailing slashes. Decision of inserted-vs-skipped reads `result.raw.length` (the actual Postgres `RETURNING` output) — never `result.identifiers.length`. The "N similar" counter joins on `content_hash` and groups by it.

**Trade-offs.** Postgres-specific. Documented as such; the codebase isn't trying to be DB-agnostic.

#### Graph endpoint returns nodes + edges in one round trip

**Context.** The Graph page needs every entity (as a node) plus every co-mention edge between them. Fetching one entity at a time would be N+1. The visual layout consumes the whole graph at once.

**Decision.** `GET /graph` returns `{ nodes, edges }`. Nodes come from a single entities-table query with a correlated subquery for `mentionCount`. Edges come from a self-join of `article_entities` on the same `article_id` with `ae2.entity_id > ae1.entity_id` as the join predicate — this collapses each unordered pair `{A,B}` to exactly one row and excludes self-pairs. INNER JOIN to `entities` on both endpoints enforces tenancy.

**Trade-offs.** O(mentions²) per article in the join. At MVP scale this is sub-millisecond; the materialized-view tech-debt item kicks in if it ever appears in slow logs.

#### Graph layout — deterministic circle, no force simulation

**Context.** react-flow takes positions as input; it doesn't compute layout. The choices were deterministic geometric placement (circle / grid) or a force-directed simulation (d3-force, dagre).

**Decision.** Plain circle. For N nodes the i-th sits at `(cx + r cos(2π·i/N), cy + r sin(2π·i/N))`. Radius scales with N so dense graphs don't crowd; order is alphabetical from the backend so the same user state always produces the same picture. Node size scales linearly with `mentionCount` (60px → 120px). Edge `strokeWidth` scales linearly with weight, capped at 4px so runaway hub edges don't dominate. CSS-variable colors for both — theme inheritance comes free.

**Trade-offs.** At small N the circle reads well; past ~20 nodes edges start criss-crossing the interior. Force-directed (d3-force) is the upgrade path, tracked as tech debt.

#### Regenerate is the one mutation in ArticlesController

**Context.** The articles HTTP layer is otherwise read-only — every status transition belongs to a worker. But users need a way to re-classify after changing their taxonomy.

**Decision.** `POST /articles/regenerate` is a single bulk `UPDATE articles SET status='pending_llm' WHERE user_id=:u AND status='processed'`. The article-process worker then re-runs the LLM analysis on its normal cycle. The HTTP path stays within the state-machine invariants (no row is jumped to a status the worker can't reach). The Settings UI gates it behind a two-step inline confirmation, not a Dialog — the action is recoverable in minutes, not destructive forever.

**Trade-offs.** One documented exception is cleaner than pretending the read-only rule has none. A future "re-process this one article" feature has to enqueue at the worker layer rather than munging the row directly.

---

## Environment variables

The full schema (zod-validated at boot) lives in [`packages/backend/src/config/env.schema.ts`](./packages/backend/src/config/env.schema.ts). The keys you most often touch:

| Variable                       | Default                  | Notes |
|--------------------------------|--------------------------|-------|
| `NODE_ENV`                     | `development`            | Controls cookie `Secure` flag and dev-mode confirmation URL surfacing. |
| `POSTGRES_HOST/PORT/USER/PASSWORD/DB` | values in `.env.example` | Compose overrides `HOST=postgres` and `REDIS_HOST=redis`. |
| `JWT_SECRET` / `JWT_EXPIRATION` | dev value / `7d`         | Both cookie `maxAge` and JWT `exp` derive from `JWT_EXPIRATION` via `ms`. |
| `USER_LOGIN` / `USER_PASSWORD` | `admin` / `changeme`     | Bull Board basic-auth. |
| `LLM_ACTIVE_PROVIDER`          | `mock`                   | One of `mock`, `openai`, `anthropic`. |
| `LLM_FAILOVER_PROVIDER`        | (unset)                  | Optional secondary; cannot equal `LLM_ACTIVE_PROVIDER`. |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | — / `gpt-4o-mini`     | Required if active or failover provider is `openai`. |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` | — / `claude-haiku-4-5-20251001` | Required if active or failover provider is `anthropic`. |
| `LLM_CONCURRENCY`              | `3`                      | Per-process semaphore cap for outbound LLM calls. |
| `LLM_MAX_TOKENS_PER_REQUEST`   | `4000`                   | Hard cap on completion tokens. |
| `PREFILTER_MIN_CONTENT_LENGTH` | `300`                    | Below this, article is filtered as `content_too_short`. |
| `PREFILTER_MAX_LINK_DENSITY`   | `0.4`                    | Above this ratio, filtered as `high_link_density`. |
| `FEED_POLL_CRON`               | `*/30 * * * *`           | Schedule for the system-wide poll tick. |
| `ARTICLE_PROCESS_CONCURRENCY`  | `2`                      | BullMQ worker concurrency for the LLM pipeline stage. |
| `RUN_MIGRATIONS_ON_BOOT`       | `true`                   | Apply pending migrations during backend boot. |
| `SEED_DEMO_ON_BOOT`            | `true`                   | Run the idempotent demo seed. |

`.env` is gitignored. Only `.env.example` is committed.

---

## Known gaps and tech debt

Brief — the full list (with rationale and trigger conditions) lives in [PLAN.md](./PLAN.md) under "Tech debt / refactor opportunities".

**Honestly partial Must items:**
- **Full LLM fuzzy `matchEntities`.** Currently deterministic-only (case-insensitive canonical name). The `aliases` JSONB column is provisioned and the LLM operation is declared with `NotImplementedException`. Phase 2 is the natural next step.

**Should items not yet shipped:**
- Unit tests on critical paths (LLM adapters, RSS parsing, pre-filter, dedup).
- Period digests (day / week / month).
- Extended graph filters (type filter, min-mentions filter, time window, text search on the graph view).
- LLM telemetry dashboard surfaced in the UI (data already accumulates in `llm_telemetry`).

**Productionisation work for after the milestone:**
- CSRF token (current cookie + SameSite=Lax is acceptable for the milestone; production needs a token).
- Circuit breaker around the primary LLM adapter — currently every job pays one failed-primary RTT during sustained outage.
- Materialized `entity_co_mentions` view if the self-join ever appears in slow logs.
- Force-directed graph layout (d3-force or webcola) when typical accounts have 20+ entities.
- Worker process split — currently runs in the same Node process as the API.

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
