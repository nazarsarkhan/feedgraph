# Implementation Plan

This file tracks scope, decisions, and progress. It is a working document, not for submission.

## Must (blocking — required for acceptance)

- [x] Registration with email confirmation (dev mode: link logged + shown in UI with DEV MODE label)
- [x] Login / logout, session survives page reload
- [ ] Multi-user data isolation at data-access layer
- [x] CRUD for RSS feeds with status (active / paused / error)
- [x] CRUD for user categories
- [x] CRUD for categorization axes with 4-5 seeded defaults
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

- **ADR: JWT delivered via HttpOnly cookie, not Authorization header**
  - Context: Spec requires session that survives page reload (US-2). Two common patterns: Bearer token in Authorization header (frontend stores in localStorage/memory) vs. JWT in an HttpOnly cookie.
  - Decision: HttpOnly cookie named `access_token`, attributes HttpOnly + SameSite=Lax + Path=/, Secure gated on NODE_ENV=production.
  - Alternatives: Authorization header with localStorage — rejected, XSS-readable; requires frontend to re-attach token on every request; doesn't survive reload without extra logic.
  - Trade-offs: Cookie auth opens CSRF surface (mitigated short-term by SameSite=Lax; CSRF middleware tracked under Known gaps). Cookie transmission is automatic, which is exactly what US-2 wants.

- **ADR: Email confirmation via random 32-byte hex token with expiry on user row**
  - Context: Spec requires registration with email confirmation flow. Need a token that's unguessable, revocable, expirable, and doesn't introduce a second secret to manage.
  - Decision: 32 random bytes (256 bits) rendered as hex (64 chars) stored on the user row alongside `email_confirmation_expires_at` (24h default). Re-request overwrites prior token.
  - Alternatives: (1) Sign a separate JWT for confirmation — rejected, requires a second secret and an extra revocation mechanism. (2) Short numeric code — rejected, weak entropy.
  - Trade-offs: Single-purpose column on `users` rather than a separate `tokens` table; fine while we have one confirmation flow, would split out if we add password-reset or invite tokens.

- **ADR: argon2id for password hashing**
  - Context: Spec allows argon2 or bcrypt. Need a modern, memory-hard hash with a clear default-parameters story.
  - Decision: argon2 npm package, default parameters (argon2id variant).
  - Alternatives: bcrypt — still acceptable but older, no memory-hardness, parameter tuning is less safe; scrypt — fine but ecosystem is thinner in Node.
  - Trade-offs: argon2 is a native module; we've verified prebuilt binaries exist for the runtime image (node:20-alpine), so no toolchain pulled into runtime.

- **ADR: Multi-tenant isolation via explicit per-method userId filter**
  - Context: Spec Principle 4 requires user data isolation. Two common patterns: (a) explicit userId parameter on every service method with WHERE user_id = ? in every query, or (b) automatic filtering via a TypeORM subscriber/middleware that injects user_id into all queries by context.
  - Decision: Pattern (a). FeedsService methods all take userId as their first parameter, and a marker comment at the top of the file states the contract. Same convention will apply to all future per-user resources (categories, axes, articles).
  - Alternatives: (1) Auto-filter subscriber — rejected, hides the contract from readers and breaks down for cross-tenant operations (e.g., admin views, future workers). (2) Row-level security in Postgres — rejected, adds a third place to manage auth and we lose the option of pooled connections without per-request SET LOCAL.
  - Trade-offs: Every method signature carries userId, which is verbose but loud. Any service method missing the filter is visible in code review, not hidden in framework wiring.

- **ADR: Two-layer feed validation (format + live parse)**
  - Context: Spec says feeds with status='error' should be tracked. We need to decide when a feed enters error state: at creation (sync) vs. only when polling fails (async).
  - Decision: Validate at creation in two layers. (1) class-validator @IsUrl with http/https protocols only — catches typos before any I/O. (2) Live rss-parser fetch with a hard timeout — catches dead URLs, non-RSS content, and malformed feeds before they're persisted. On failure we return 422 with the parser's reason; we never persist a feed that can't be polled.
  - Alternatives: (1) Persist immediately and let the polling worker discover failures — rejected, makes the UI show "active" feeds that have never worked and pushes the first error into a background job the user doesn't observe. (2) Skip live validation — rejected, accepts garbage URLs.
  - Trade-offs: Adds latency (up to FEED_VALIDATION_TIMEOUT_MS) to POST /feeds. Acceptable: the operation is user-initiated and a 10s budget is well under the typical patience threshold for "save". Tracked via a tight env-configurable timeout so we can tune.

- **ADR: Default axes seeded inside a transaction at registration**
  - Context: Spec requires 4-5 seeded axes for every user. A user without axes is a broken state (LLM tagging has nowhere to tag onto). The user-create and axis-seed must succeed or fail together.
  - Decision: Wrap user-row insert + axis-seed in a single DataSource.transaction in AuthService.register. The transactional EntityManager is passed into AxesService.seedDefaultsForUser(userId, manager). seedDefaultsForUser is idempotent (count-then-skip) so it's safe to invoke standalone in the future (e.g., a "regenerate defaults" admin action). The circular dep (AuthModule ↔ AxesModule) is resolved with forwardRef on both sides.
  - Alternatives: (1) Event listener on user-created — rejected, async-after-the-fact violates atomicity. (2) Seed lazily on first GET /axes — rejected, hides the failure from the user who'd see "I have no axes" with no clear cause. (3) Catch seed failure and log warn — rejected, leaves the DB in a broken state.
  - Trade-offs: forwardRef makes module wiring slightly harder to read. Worth it: the transaction guarantee is more important than the wiring aesthetic.

- **ADR: forwardRef between AuthModule and AxesModule for transactional seed**
  - Context: AuthService.register needs to seed default axes atomically with user creation; AxesController needs JwtAuthGuard + EmailConfirmedGuard from AuthModule. This creates a circular module dependency.
  - Decision: Resolve the cycle with @nestjs/common forwardRef on both sides. AuthService injects AxesService via forwardRef; the seed is invoked inside a DataSource.transaction so user-create and axis-seed commit or roll back together. seedDefaultsForUser accepts an optional EntityManager to participate in the outer transaction.
  - Alternatives:
    1. Event-based decoupling (emit UserCreatedEvent, AxesModule subscribes) — rejected. Loses transactional atomicity; the event handler runs after the transaction commits, so axis-seed failures cannot roll back the user. A user without seeded axes is broken-state per spec.
    2. Move the guards to a separate AuthGuardsModule, then AuthModule depends on AxesModule one-way — rejected for now. Premature decomposition; if a third module wants to call AuthService directly we'll revisit.
    3. Inline the seed SQL into the user-create transaction without going through AxesService — rejected. Duplicates the default axis definition (DEFAULT_AXES constant would live in two places) and bypasses the service layer.
  - Trade-offs: forwardRef is a recognized NestJS escape hatch but signals the modules are tightly coupled. The seed contract is well-defined (one method, idempotent, manager-aware), so the coupling has a clear shape.

- **ADR: Axes use a two-table schema (axes + axis_values) with eager-loaded children**
  - Context: An axis is a tagging dimension; its values are the allowed slots. Values need stable ordering for UI rendering and consistent LLM prompts. Reading an axis without its values is never useful.
  - Decision: Two tables — `axes` (id, user_id, name) and `axis_values` (id, axis_id, value, position). `position` is an int, assigned on create as 0..n-1 and as `max(position)+1` on add. `cascade: true` on Axis.values lets us save an axis and its initial values in one statement; `eager: true` removes the N+1 risk when listing axes.
  - Alternatives: (1) Store values as a JSONB array column on `axes` — rejected, individual-value rename/delete and per-value uniqueness become awkward; ordering bookkeeping moves into application code. (2) Use a single denormalized table — rejected, rename of an axis would touch N rows.
  - Trade-offs: Eager loading is global per-axis, so anyone needing axes-without-values pays for the join. Acceptable: every current use site wants the values.

- **ADR: Hand-written TypeORM migrations**
  - Context: TypeORM offers migration:generate for auto-diffing entity changes against the DB schema. Auto-generation requires running CLI against a live DB synced with prior migrations, and produces brittle diffs around enum types, partial indexes, and FK ordering. The first migration (users) was auto-generated; the second (feeds) was hand-written.
  - Decision: Going forward, all migrations are hand-written. migration:generate is kept as a scaffolding helper (run it, inspect the diff, use it as a starting point) but never committed as-is.
  - Alternatives: (1) Keep using migration:generate — rejected, generated SQL is opaque and reviewers can't tell intent. (2) Drop migrations and use TypeORM synchronize: true — already rejected, dangerous in any non-throwaway DB.
  - Trade-offs: Slightly more typing per migration, but reviewers (including the spec's reviewer) see clear DDL with intent visible.

- **ADR: strictPropertyInitialization disabled in backend tsconfig**
  - Context: TypeORM @Column and class-validator DTO fields are populated by framework metadata/transform, not by constructors. TypeScript's strictPropertyInitialization rule demands constructor initialization and produces noise on every framework-managed field.
  - Decision: Set strictPropertyInitialization: false in packages/backend/tsconfig.json only. All other strict flags remain on.
  - Alternatives: (1) Use `!` definite-assignment assertion on every entity column and DTO field — rejected, ten files of noise per entity. (2) Use Prisma which doesn't have this issue — rejected, see TypeORM ADR. (3) Disable strict entirely — rejected, too broad.
  - Trade-offs: Loses compile-time check that other classes' fields are initialized in constructors, but the trade is scoped to the backend package; shared and frontend keep full strict.

Tech debt / refactor opportunities:

- [ ] CSRF protection. Deferred from the auth step. Cookie-delivered JWT + SameSite=Lax + same-origin frontend in dev gives us acceptable risk for the milestone, but production needs a CSRF token (double-submit or per-form synchronizer pattern). Track as a dedicated step.
- [ ] Articles → feeds FK with ON DELETE SET NULL. Spec: "видалення фіда не видаляє вже оброблені статті, але від'язує їх від живого джерела". The clause goes into the articles migration when we add the articles table; the current feeds delete is a hard delete with no FK to satisfy yet.
- [ ] AuthModule should re-export UsersModule for guards that need user lookup. Currently every feature module that mounts EmailConfirmedGuard must also explicitly import UsersModule. Refactor when the third such module appears (currently only Feeds).

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
