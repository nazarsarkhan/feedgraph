# Implementation Plan

This file tracks scope, decisions, and progress. It is a working document, not for submission.

## Must (blocking — required for acceptance)

- [ ] Registration with email confirmation (dev mode: link logged + shown in UI with DEV MODE label)
- [ ] Login / logout, session survives page reload
- [ ] Multi-user data isolation at data-access layer
- [ ] CRUD for RSS feeds with status (active / paused / error)
- [ ] CRUD for user categories
- [ ] CRUD for categorization axes with 4-5 seeded defaults
- [ ] Feed polling worker (scheduled + manual trigger)
- [ ] Article processing worker
- [ ] Heuristic pre-filter (deterministic, before any LLM call)
- [ ] LLM abstraction with OpenAI and Anthropic adapters, switchable via env
- [ ] Structured output validation (zod) before persisting LLM results
- [ ] Article deduplication across feeds (URL + content hash) with "N similar" counter
- [ ] Entity deduplication (Microsoft / MSFT / Microsoft Corp. / Cyrillic spellings collapse to one node)
- [ ] Cost control: token limit per article via env, LLM result cache by content hash, concurrency limit via env
- [ ] Structured logging + LLM telemetry (calls, tokens, by operation)
- [ ] Article feed with filters (category, feed, importance, time window)
- [ ] Article card with summary, entities, categories, similar articles
- [ ] Graph page with react-flow, typed edges (mentions / co_mention / similar), filter by node type and category
- [ ] Entity card with mentioning articles, related entities, mention frequency over time
- [ ] Settings UI for axes with "regenerate" action
- [ ] Regeneration worker with progress, non-blocking UI
- [ ] Bull Board (or equivalent) with basic-auth from env
- [ ] One-command startup via `docker compose up` on a clean machine
- [ ] Demo data seeding (script or demo feed) so reviewer sees a working graph within minutes
- [ ] README with setup instructions and Architectural Decisions section

## Should (heavily affects score, doesn't block acceptance)

- [ ] Failover between LLM providers on error
- [ ] Meaningful unit tests on critical parts (LLM adapters, RSS parsing, pre-filter, dedup)
- [ ] Extended graph filters: time window, text search
- [ ] Period digests (day / week / month)
- [ ] LLM telemetry dashboard in UI

## Could (bonus)

- [ ] Edge animation along timestamps (event flow direction)
- [ ] Graph timeline mode with slider
- [ ] Visual graph clustering by category
- [ ] Top entities and categories dashboard for a period
- [ ] Full-text article search
- [ ] Graph export
- [ ] Semantic similarity between articles (embeddings)

## Architectural Decisions (notes for ADR section)

Capture decisions here as they're made. Format for final README:

- **ADR-N: <name>**
  - Context:
  - Decision:
  - Alternatives:
  - Trade-offs:

Decided:

- **ADR: ESLint flat config with FlatCompat shim**
  - Context: TS NFR-4 requires Google TypeScript Style Guide enforced by lint. ESLint 10 dropped legacy .eslintrc support; eslint-config-google has been unmaintained since 2018 and only ships in legacy format.
  - Decision: Use ESLint 10 flat config (eslint.config.cjs) with @eslint/eslintrc's FlatCompat to load eslint-config-google.
  - Alternatives: (1) Pin ESLint to v8 — rejected, EOL with no security patches. (2) Replicate Google rules manually in flat config — rejected, spec explicitly names the Google config, replicating opens an argument with the reviewer.
  - Trade-offs: FlatCompat is an officially supported migration bridge from the ESLint team, but eslint-config-google is a known maintenance hotspot. If it breaks, the migration path is to inline the relevant Google rules directly.

- **ADR: Bull Board via standalone deadly0 image**
  - Context: Spec requires queue monitoring via Bull Board "or equivalent" with basic-auth, mountable without embedding it into the backend ("сама панель не вбудована в застосунок").
  - Decision: Use deadly0/bull-board standalone Docker image, gated on Redis healthcheck, basic-auth via USER_LOGIN/USER_PASSWORD env vars.
  - Alternatives: (1) @bull-board/express mounted inside NestJS — rejected, spec explicitly says "не вбудована в застосунок". (2) bull-board/api directly in a sidecar — rejected, deadly0 wraps it with basic-auth and gives us the spec requirement for free.
  - Trade-offs: External image means we don't control its dependencies; if it goes unmaintained, fallback is to write a 50-line sidecar with @bull-board/express and basic-auth middleware. The "не вбудована" constraint is satisfied by running it as a separate container.

- **ADR: TypeORM over Prisma**
  - Context: Project needs JSONB columns (entity aliases, metadata), complex graph queries (mentions, co-mentions), and custom SQL migrations (pg_trgm indexes for fuzzy entity matching).
  - Decision: TypeORM via @nestjs/typeorm.
  - Alternatives: Prisma — better DX but no official NestJS integration, harder to mix raw SQL into migrations, schema lives outside TypeScript files.
  - Trade-offs: TypeORM's QueryBuilder is more verbose than Prisma's client, but the project's query complexity justifies the lower abstraction. Migration story is more flexible.

- **ADR: CommonJS for backend, ESM for shared/frontend**
  - Context: NestJS depends on emitDecoratorMetadata + reflect-metadata, which only work with CommonJS module output. Modern shared/frontend code should be ESM.
  - Decision: backend tsconfig overrides module: "commonjs" + moduleResolution: "node"; shared and frontend inherit base tsconfig's NodeNext/ESM.
  - Alternatives: Make the whole monorepo CommonJS — rejected, drags shared and frontend backward; use SWC instead of tsc for backend with ESM — rejected, adds another toolchain to justify.
  - Trade-offs: Mixed module systems in one repo, but isolated cleanly by package boundary. Shared types are emitted as both .js (CJS-compatible) and .d.ts, so backend can consume them.

- **ADR: ESLint new-cap rule scoped relaxation for TypeScript decorators**
  - Context: eslint-config-google (2018) ships with `new-cap` enabled. The rule flags PascalCase function calls without `new`, which conflicts with TypeScript decorator syntax (@Injectable(), @Controller(), etc.) used pervasively by NestJS.
  - Decision: Override `new-cap` to { capIsNew: false } scoped to *.ts files only. Plain .js/.cjs files keep the strict Google default.
  - Alternatives: (1) Disable new-cap globally — rejected, loosens the rule for non-TS files unnecessarily. (2) Replace eslint-config-google entirely — rejected, spec requires it.
  - Trade-offs: Loses one of new-cap's directions (capIsNew) for TS files, but newIsCap (the more important direction — preventing class calls without `new`) is preserved.

Required ADRs (per spec):
- [ ] Split between deterministic code and LLM (Principle 1)
- [ ] Entity deduplication strategy
- [ ] Cost control and LLM caching
- [ ] LLM provider error handling strategy
- [ ] Backend choice (NestJS chosen — document why over Directus)

Additional ADRs I'm planning:
- [ ] Database choice (PostgreSQL — JSONB for entity aliases, pg_trgm for fuzzy matching)
- [ ] Graph storage model (relational vs document)
- [ ] Multi-tenant isolation approach
- [x] ESLint flat config with FlatCompat shim (eslint-config-google legacy compatibility)

## Quality gates I commit to

- [ ] Lint passes on every commit (Google TS Style Guide)
- [ ] No zero-width / BOM / invisible Unicode anywhere in repo
- [ ] No dead code, no commented-out blocks, no placeholder files
- [ ] No direct LLM calls from HTTP handlers — everything through BullMQ
- [ ] No secrets in repo — only .env.example with comments
- [ ] No hardcoded config (token limits, schedules, model names, worker counts) — all via env
- [ ] Every commit is meaningful, messages follow conventional commits

## Anti-patterns to avoid (from spec section 9.7)

- Single "initial commit" with the whole project — graded down severely
- High-level LLM wrapper (LangChain etc.) as the architecture
- Synchronous LLM calls inside HTTP handlers
- Implementing nice-to-haves while Must items are incomplete
- AI-generation artifacts: zero-width chars, contradictory styles in adjacent files, assistant-voice comments
- Code I can't explain
