# Implementation Plan

This file tracks scope, decisions, and progress. It is a working document, not for submission.

## Must (blocking — required for acceptance)

- [x] Registration with email confirmation (dev mode: link logged + shown in UI with DEV MODE label)
- [x] Login / logout, session survives page reload
- [ ] Multi-user data isolation at data-access layer
- [x] CRUD for RSS feeds with status (active / paused / error)
- [x] CRUD for user categories
- [x] CRUD for categorization axes with 4-5 seeded defaults
- [x] Feed polling worker (scheduled + manual trigger)
- [x] Article processing worker (PARTIAL: deterministic entity dedup only; LLM fuzzy matchEntities is a separate step)
- [x] Heuristic pre-filter (deterministic, before any LLM call)
- [ ] LLM abstraction with OpenAI and Anthropic adapters, switchable via env (PARTIAL: OpenAI + Mock done, Anthropic next step)
- [x] Structured output validation (zod) before persisting LLM results
- [ ] Article deduplication across feeds (URL + content hash) with "N similar" counter
- [ ] Entity deduplication (Microsoft / MSFT / Microsoft Corp. / Cyrillic spellings collapse to one node)
- [x] Cost control: token limit per article via env, LLM result cache by content hash, concurrency limit via env
- [x] Structured logging + LLM telemetry (calls, tokens, by operation)
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

- **ADR: Schedule via @nestjs/schedule (cron in app process), jobs via BullMQ**
  - Context: Polling needs to fire on an interval and per-feed work needs to be queued with retry/concurrency. Two natural choices for the scheduler: BullMQ repeatable jobs vs. an in-process cron that enqueues per-tick.
  - Decision: @nestjs/schedule + SchedulerRegistry to register a CronJob that ticks every FEED_POLL_INTERVAL_MINUTES; the tick body queries `feeds where status='active'` and `queue.add('poll', { feedId })` per feed. BullMQ owns concurrency, retry, and per-job state.
  - Alternatives: (1) BullMQ repeatable jobs — rejected, known recovery edge cases on restart and the schedule can duplicate across multiple app instances. (2) External cron container — rejected, premature; same-process is simpler for this milestone.
  - Trade-offs: Cron lives in the app process, so if the app is down the tick is missed (no catch-up). Acceptable for a polling worker — the next tick will pick up missed feeds.

- **ADR: Article dedup via Postgres ON CONFLICT DO NOTHING on (user_id, url_normalized)**
  - Context: The worker re-inserts the same articles every poll; we need an idempotent write that's cheap and race-free.
  - Decision: TypeORM `.orIgnore()` (Postgres ON CONFLICT DO NOTHING) against the composite unique index `(user_id, url_normalized)`. Returns whether a row was inserted via `result.raw.length` (see follow-up ADR); on conflict, we do one follow-up SELECT to fetch the existing id for the caller.
  - Alternatives: (1) SELECT-then-INSERT — rejected, race condition between the check and the write. (2) UPSERT with DO UPDATE — rejected, we don't want re-polls to overwrite content that downstream workers may have already processed.
  - Trade-offs: ON CONFLICT DO NOTHING returns no row on conflict, so we pay one extra SELECT per skip. Acceptable: skips are the steady-state common case, and the index lookup is cheap.

- **ADR: orIgnore inserted-vs-skipped reporting reads result.raw, not result.identifiers**
  - Context: TypeORM's .insert().orIgnore() (Postgres ON CONFLICT DO NOTHING) returns both `identifiers` (client-generated UUIDs, always populated before the query) and `raw` (the actual RETURNING output from the database, empty on conflict). Using `identifiers.length` to decide "was a row inserted?" produces a false positive on every conflict — the counter says inserted, the database silently skipped.
  - Decision: ArticlesService.upsertFromRssItem reads result.raw.length to determine actual insertion; identifiers is not used as a truth source for this branch.
  - Alternatives: (1) Query for the row before insert — rejected, race condition + extra round-trip. (2) Switch to ON CONFLICT DO UPDATE — rejected, we genuinely want to skip, not update. (3) Catch unique-violation exceptions — rejected, exception-based control flow on the hot path.
  - Trade-offs: result.raw shape is driver-specific (Postgres returns array of inserted rows; MySQL returns metadata). The project pins Postgres, so this is fine; documented here as a Postgres-coupling point.

- **ADR: URL normalization strips tracking params for stable dedup**
  - Context: The same article often arrives with different query strings (utm_*, fbclid, gclid, ref, source) depending on where the publisher syndicated it. Naive URL comparison would treat each variant as a distinct article.
  - Decision: A pure UrlNormalizerService.normalize(url) that: lowercases host, drops fragment, strips a conservative tracking-param allowlist, alphabetizes remaining params, and removes trailing slash from non-root paths. Pure function — no I/O, easy to test.
  - Alternatives: (1) Strip all query params — rejected, breaks legitimate URLs (article id, page number). (2) Normalize at read time — rejected, would require a virtual column or function index; cheaper to normalize once on write.
  - Trade-offs: The tracking allowlist is conservative — exotic trackers will still produce duplicates. We can extend the allowlist as we observe duplicates in real data.

- **ADR: Entities + article_entities link table for many-to-many "mentions"**
  - Context: Articles mention entities; a single entity is mentioned by many articles; a single article mentions many entities. This is the canonical many-to-many shape. Two alternatives: (a) `mentions jsonb` column on `articles`, (b) a dedicated link table.
  - Decision: Dedicated `article_entities (article_id, entity_id, created_at)` with composite PK. JSONB would force `unnest`-style queries every time we want to count mentions per entity, ORDER BY mentions, or page through "all articles mentioning X". The link table makes those native index lookups.
  - Alternatives: (1) JSONB array on articles — rejected, see above. (2) Surrogate id on the link row — rejected, the (article, entity) pair is already a natural unique key; ON CONFLICT DO NOTHING on the composite PK gives us idempotent retries for free.
  - Trade-offs: One extra table to migrate and one extra join when querying. Both are cheap.

- **ADR: article_categories and article_axis_values as link tables with composite PKs**
  - Context: Same many-to-many shape for category and axis-value assignments, same trade-offs.
  - Decision: Mirror the entities pattern — `(article_id, category_id)` and `(article_id, axis_value_id)` link tables with composite PKs and ON DELETE CASCADE on both FKs. The worker's idempotent re-runs reuse the same composite-PK + orIgnore pattern as everywhere else in the pipeline.
  - Alternatives: (1) `categories jsonb` / `axes jsonb` columns on `articles` — rejected, same reason as entities. (2) A single "tags" table conflating categories and axis values — rejected, conflates two distinct user concepts and loses the per-axis "exactly one value" constraint.
  - Trade-offs: Three link tables instead of one polymorphic. Worth it — each table can index its own join column and the foreign-key constraints actually enforce per-axis semantics at the schema level.

- **ADR: Deterministic entity dedup now; LLM fuzzy match is a later step**
  - Context: The LLM returns surface forms (Microsoft, MSFT, Microsoft Corp.) that should collapse to one entity. Two questions: when does dedup happen, and how aggressive should it be at first?
  - Decision: This step does only deterministic dedup — case-insensitive `(user_id, lower(canonical_name), type)` uniqueness. If two articles mention the same name + type, they reuse the entity row. Different surface forms ("Microsoft" vs "MSFT") create separate rows; the fuzzy merge is the `matchEntities` LLM op landing in a follow-up step, which will write surface variants into the `aliases` JSONB column already provisioned on the `entities` table.
  - Alternatives: (1) Skip the `aliases` column until the fuzzy step — rejected, having to migrate the column in later forces a backfill; cheaper to land it empty now. (2) Try a string-similarity dedup (Levenshtein, trigram) in this step — rejected, would have to be tuned against real data we don't have yet and risks the wrong merges (TypeScript vs JavaScript) before any human review path exists.
  - Trade-offs: We'll see duplicate-looking entity rows in the UI until `matchEntities` lands. Acceptable trade for a clean staging point.

- **ADR: LLM `importance='junk'` maps to `status='filtered'` with `filter_reason='llm_junk'`**
  - Context: Two filter passes in the pipeline — deterministic prefilter (cheap, before any token spend) and LLM filter (smarter, runs after). They need to live in the same state machine so the UI's "filtered" list reflects both.
  - Decision: When the LLM returns `importance='junk'`, the worker writes `status='filtered'` and `filter_reason='llm_junk'` (a new reason value alongside the prefilter rule names). The article carries `summary=<the LLM summary>` and `importance=null` (because the importance column only stores values that mean "kept"). No separate "rejected by LLM" state.
  - Alternatives: (1) A new top-level state like `llm_rejected` — rejected, no UI screen would treat it differently from `filtered`. (2) Keep junk articles at `pending_llm` with a flag — rejected, conflates terminal state with awaiting-work state.
  - Trade-offs: `filter_reason` is now drawn from two distinct producers (rule names + the constant `llm_junk`). Documented in code; the existing tech-debt entry about promoting `filter_reason` to its own enum already covers the consolidation when the value list stabilizes.

- **ADR: LLM summary stored on the article row, not in a separate table**
  - Context: The LLM produces a summary plus richer relationships. The summary is a 1-3 sentence string; the relationships are many-to-many edges.
  - Decision: `summary text` lives directly on `articles`. Entities, category assignments, and axis-value assignments live in their own link tables (see ADRs above). The split lines up with cardinality — single value on the row, many-to-many in link tables.
  - Alternatives: (1) Move summary into a sidecar `article_llm_output` table — rejected, premature normalization; we always want the summary when we want the article and a NULL column is the same disk footprint either way. (2) Stuff summary, importance, and a JSONB of relationships into one `llm_output jsonb` column on `articles` — rejected, sacrifices the relational queries that the graph UI actually needs.
  - Trade-offs: The `articles` row grows by one TEXT column. Negligible — the article body is already there.

- **ADR: LLM-derived relationships re-validated against the user's current categories/axes at process time**
  - Context: The LLM is given the user's category list and axes in the prompt and asked to pick from them, but nothing prevents it from hallucinating a category name or a value that no longer exists. Worse, the user might rename a category between enqueue and process.
  - Decision: The worker pulls the user's current `categories` and `axes` (with values) at process time, builds two lookup maps, and only inserts links for hints/values that match by exact name. Unknown hints are dropped silently with a `debug`-level log. The article ends up with the relationships the user's current taxonomy actually permits.
  - Alternatives: (1) Trust the LLM and try to insert; let FK errors surface — rejected, breaks the transaction and stalls retries on a recoverable mismatch. (2) Snapshot the taxonomy at enqueue and use the snapshot — rejected, processes articles against a stale view of the world and surprises users who renamed things.
  - Trade-offs: Two extra reads per processed article (categories, axes). Both go to indexed per-user lookups; cost is in microseconds against the multi-second LLM call.

- **ADR: Worker is idempotent on `article.status` to handle replays**
  - Context: BullMQ retries failed jobs. A manual re-queue or a worker restart can also re-deliver. Re-processing an article that's already `processed` would either crash on unique-constraint violations (entity link tables) or, worse, silently overwrite the result with a different LLM run.
  - Decision: On entry the worker reads `article.status`. If it isn't `pending_llm`, the worker logs and returns a `noop` outcome — no LLM call, no DB writes. Combined with the link tables' composite PKs + orIgnore, a re-delivered job that *did* slip past the status check is also safe at the lower layer.
  - Alternatives: (1) Trust BullMQ's "once" delivery — rejected, BullMQ guarantees at-least-once, not exactly-once. (2) Use a lock table for in-flight articles — rejected, adds a third coordination layer; the status field already encodes "in-flight vs done".
  - Trade-offs: The status check is a single indexed read. Adds one round-trip on entry; trivially cheap and saves us from a class of bugs we'd otherwise discover the hard way.

- **ADR: Persistence wrapped in a single DataSource.transaction**
  - Context: A processed article has four persisted concerns: entities, entity links, category/axis links, the article row's summary/importance/status. Partial success (entity rows created but no article link, status updated but no relationships) leaves the system in a confusing state.
  - Decision: All four happen inside `DataSource.transaction`. EntityManager is threaded through `GraphEntitiesService.findOrCreate` and `linkToArticle` so all queries hit the same QueryRunner and uncommitted rows are visible to the link inserts. (We discovered this the hard way: an initial pass used `manager.connection.createQueryBuilder()` for the link insert, which bypasses the transaction; FK violations followed because the freshly-inserted entity rows weren't yet visible. Fix: `manager.createQueryBuilder()`.)
  - Alternatives: (1) No transaction, rely on idempotency to clean up — rejected, leaves observable intermediate states. (2) Outbox-style with a state machine — rejected, premature; one transaction is sufficient at this scale.
  - Trade-offs: A long-ish transaction (covers up to ~50 entity upserts on a single article) holds row-level locks for the duration. Acceptable per-article volume; if we ever batch multiple articles into one tx, we'd revisit.

- **ADR: One LlmService interface, three methods, one fully implemented**
  - Context: The LLM is used for three distinct operations — analyze article, match entities, build digest. Building all three before any one works end-to-end is high risk; one full vertical slice teaches us the abstraction first.
  - Decision: `LlmService` declares `analyzeArticle`, `matchEntities`, `buildDigest` from day one. Only `analyzeArticle` is implemented in this step. The other two throw `NotImplementedException` so callers that try to use them fail loudly. They land in subsequent steps once the wider pipeline (entity dedup, digest scheduling) is in place.
  - Alternatives: (1) Define only analyzeArticle and add the others when needed — rejected, callers would be tempted to model the LLM as single-purpose and we'd refactor the interface twice. (2) Implement all three at once — rejected, blocks any value delivery until all three work.
  - Trade-offs: Carrying two stubs in the public surface that any consumer can accidentally call. Mitigation: NotImplementedException returns 501 by default in Nest, which is loud and obvious in logs and HTTP responses.

- **ADR: Active provider selected by LLM_ACTIVE_PROVIDER env, mock is a first-class adapter**
  - Context: Two reasons to abstract the LLM: real-vs-real provider switching (OpenAI / Anthropic), and real-vs-fake provider switching (CI, fresh-clone reviewer setup). Both want the same plug-in seam.
  - Decision: A single env var `LLM_ACTIVE_PROVIDER ∈ {'mock', 'openai'}` chooses the adapter at module-load time via a factory provider. `'mock'` is the default — a fresh clone runs end-to-end with zero API keys. The mock returns deterministic, schema-valid output keyed off `sha256(prompt)` so the cache layer exercises hit/miss paths identically to a real provider. Anthropic adapter lands in the next step.
  - Alternatives: (1) Per-method provider selection — rejected, splinters telemetry and complicates the cost-cap story. (2) Use a real provider's offline / cached mode (e.g. OpenAI mocked at the HTTP layer with msw) — rejected, hides the architectural boundary and ties us to a specific provider's surface.
  - Trade-offs: Mock is a first-class production-shape concern, not a test fixture. It costs maintenance whenever the analysis schema changes. Acceptable — reviewers and new contributors need a working pipeline immediately.

- **ADR: Structured output via zod, validated twice**
  - Context: An LLM that returns malformed JSON or off-schema content cannot be allowed to write to the database. Validation must be defensive — the adapter could have a bug, the provider could change behavior, the schema could be misread.
  - Decision: Every adapter validates against the same zod schema before returning. `LlmService` re-validates the adapter's output before caching or returning. Schemas live in `@feedgraph/shared` so they're the contract between LLM layer and the rest of the app. Invalid output throws; the failure is captured as a telemetry row with `success=false`.
  - Alternatives: (1) Validate only in the adapter — rejected, defense in depth is cheap (`zod.parse` is microseconds) and protects against adapter regressions. (2) Validate only in the service — rejected, allows a buggy adapter to ship bad data before validation.
  - Trade-offs: Two parses per call. Negligible cost vs. the risk of corrupt cache rows.

- **ADR: Prompts in @feedgraph/shared, adapters carry only transport concerns**
  - Context: A prompt is business logic (what we ask the LLM to do); an adapter is transport (how we send it). Coupling them means changing the prompt requires changing every adapter.
  - Decision: `@feedgraph/shared/src/prompts/` exports pure functions like `buildAnalyzeArticlePrompt(input)`. Adapters never own prompt text. Adapters take a prompt string + schema and return parsed output. The shared package emits CommonJS so the backend's commonjs build can consume it directly via the workspace symlink; the build chain runs `npm -w @feedgraph/shared run build` before backend (encoded as a `prebuild` hook).
  - Alternatives: (1) Prompts in `packages/backend/src/llm/prompts/` — rejected, no other code outside backend will ever read it, but the principle is the same and the shared package is where cross-layer contracts (schemas) already live; keeping prompts next to their schemas is more honest. (2) Prompt strings inlined in adapters — rejected, every prompt edit becomes N edits.
  - Trade-offs: First real consumption of `@feedgraph/shared` adds a build step (shared must compile before backend); we wired it into the package.json `prebuild` script and the Dockerfile.

- **ADR: LLM cache in Postgres, never expires**
  - Context: Content with the same hash deserves the same analysis output — re-running the LLM is wasted tokens and wasted latency. The cache lookup is the cheap thing; we want a hit whenever we can get one.
  - Decision: Dedicated `llm_cache` table keyed by `(content_hash, operation, model)`. Lookup before any adapter call; insert after a successful call. JSONB value column for the structured result. No expiry — the input is content-hash-deterministic and the output is the same shape forever. No FKs to articles or users so the cache survives row deletion (reimport of the same content stays free).
  - Alternatives: (1) Redis cache — rejected, we already pay for Postgres and durability of cache rows is desirable, not just speed. (2) Filesystem cache — rejected, doesn't survive container restarts. (3) In-memory LRU — rejected, lost on restart, doesn't help worker pods coordinate.
  - Trade-offs: Cache grows unbounded with content variety. A TTL or LRU eviction is a Could feature, not needed for the MVP scale.

- **ADR: LLM telemetry in Postgres, append-only**
  - Context: We need to answer "how many LLM calls have we made, by provider, by operation; how many tokens; how many cache hits; how many failures". This dataset is fed to a future UI dashboard.
  - Decision: Dedicated `llm_telemetry` table. Every call writes a row, regardless of cache hit. Cache hits show `cache_hit=true`, zero tokens, tiny latency (so the dashboard can compute "tokens saved by cache"). Failures show `success=false` with `error_message`. `user_id` is nullable, no FKs, so telemetry survives user deletion for audit/billing. The write is best-effort — a telemetry insert failure is logged but never breaks the request path.
  - Alternatives: (1) Log lines only — rejected, queryability and aggregation become a log-pipeline problem. (2) Specialist time-series store — rejected, premature; row volume is in the hundreds per day, not millions.
  - Trade-offs: One extra insert per LLM call. Negligible compared to a 1-5s LLM round-trip.

- **ADR: In-process semaphore caps concurrent LLM requests**
  - Context: LLM providers have rate limits and we have a real money cost per call. We need a hard ceiling on simultaneous in-flight requests. BullMQ has a concurrency knob but it's per-worker-instance — splitting workers in a future step means the cap would silently double.
  - Decision: A counting semaphore inside `LlmService` (counter + queue of resolvers, no extra package). `LLM_CONCURRENCY` env var (default 3) caps in-flight requests in this Node process. Acquire on cache miss, release in `finally` so failures and successes both release. Cache hits skip the semaphore entirely (they are pure DB reads).
  - Alternatives: (1) `p-limit` / `bottleneck` — rejected, a 20-line semaphore is clearer than a dependency that does the same thing. (2) Rely on BullMQ worker concurrency — rejected, that's per-instance; the semaphore is per-process and survives a worker split. (3) Provider-side rate limiting — rejected, doesn't account for our own cost cap.
  - Trade-offs: The cap is per Node process, not global. If we ever run multiple backend instances, each gets its own pool — we'd then enforce a true global cap via Redis (BullMQ rate-limit) or a remote token bucket. Not a problem at current scale.

- **ADR: Token cap per request via LLM_MAX_TOKENS_PER_REQUEST**
  - Context: A misconfigured prompt could let the model generate thousands of tokens of unconstrained text, costing dollars per article. The completion side needs a hard ceiling.
  - Decision: Single env var `LLM_MAX_TOKENS_PER_REQUEST` (default 4000) is passed as `max_completion_tokens` to OpenAI. Mock ignores it. The cap is applied to every call regardless of operation — splitting per-operation caps is premature.
  - Alternatives: (1) Per-operation caps — rejected, complexity without a current driver. (2) Cost cap (USD) instead of token cap — rejected, requires currency conversion across providers and a budget table; tokens are the proximate cause.
  - Trade-offs: Prompt-side tokens are not capped at the adapter (they're bounded only by prompt construction); a runaway article body could still spend tokens on the input. The shared prompt builder truncates content to 12k chars as a coarse safeguard; this is good-enough for the milestone.

- **ADR: Cache hit means zero LLM call but still a telemetry row**
  - Context: Telemetry needs to answer "what would I have spent without the cache?". A cache hit that emits no row leaves the dashboard blind to its own savings.
  - Decision: On cache hit, `LlmService` still inserts a telemetry row with `cache_hit=true`, `prompt_tokens=0`, `completion_tokens=0`, `latency_ms=<lookup time>`, `success=true`. The dashboard can `SELECT sum(prompt_tokens) WHERE cache_hit=false` for actual spend and `count(*) WHERE cache_hit=true` for hit count.
  - Alternatives: (1) No row on cache hit — rejected, makes "cache savings" un-queryable. (2) Two tables (hits + misses) — rejected, unnecessary split; one column distinguishes the modes.
  - Trade-offs: Telemetry table grows faster (one row per call regardless). Acceptable — see telemetry ADR; volume is well within Postgres' comfort zone.

- **ADR: No LLM secrets in logs**
  - Context: API keys in logs are a perennial leak source — log aggregators, CI artifacts, screen recordings all become attack surface.
  - Decision: The `OpenAiAdapter` constructor receives `apiKey` and passes it directly to the OpenAI client. It is not stored on any field that gets logged, never appears in error messages we construct, and never appears in telemetry rows. Prompts MAY be logged at `debug` level (off by default); production NestJS Logger level is `log` which omits debug.
  - Alternatives: (1) Pass the key via env directly to the OpenAI SDK without going through our config layer — rejected, makes the conditional validation (required when openai is active) hard to enforce. (2) Encrypt at rest in the config layer — premature, we control the deploy.
  - Trade-offs: We rely on the OpenAI SDK to redact the key in its own thrown errors. If that ever regresses, our logs would carry it; mitigation is the `error.cause` wrap-and-rethrow pattern in our adapter, which surfaces the SDK's redacted error rather than its internals.

- **ADR: Pre-filter as a standalone worker on its own queue**
  - Context: Heuristic pre-filtering (deterministic, no LLM) is the gate that Principle 1 calls out — "LLM is a point tool, not a universal aggregator". The filter could live inline in FeedPollService or as its own worker. Inline keeps one queue but mixes RSS-fetch failure modes with content-filter failure modes; standalone separates them.
  - Decision: One queue per pipeline stage — `feed-poll` → `article-prefilter` → (future) `article-process`. FeedPollService enqueues an `article-prefilter` job per newly inserted article; PrefilterProcessor consumes it, runs the rules, persists status + filter_reason. Skipped duplicates (orIgnore returned no row) are not enqueued.
  - Alternatives: (1) Inline in FeedPollService — rejected, couples retry policy across two very different failure modes. (2) Single combined "process" worker — rejected, pre-filter and LLM-process have different concurrency profiles (prefilter is CPU-light + DB-only, LLM is network-bound + slow); separating them lets us tune independently.
  - Trade-offs: Two queues to monitor (offset by per-stage Bull Board visibility) and one extra round-trip per inserted article. The trip is local Redis, well under a millisecond per add.

- **ADR: Filter rules in code, thresholds in env**
  - Context: Pre-filter has two kinds of knobs — operational (how short is "too short", what link density is "too high") and behavioural (which patterns count as clickbait, which rules exist at all).
  - Decision: PREFILTER_RULES is an exported const in PrefilterService — a `readonly` array of `{name, check}` pairs. Adding/removing a rule is a code change with review. Numeric thresholds (PREFILTER_MIN_CONTENT_LENGTH, PREFILTER_MAX_LINK_DENSITY) are env vars validated by zod at boot. Worker concurrency (PREFILTER_WORKER_CONCURRENCY) is also env.
  - Alternatives: (1) Rule list in DB with a UI editor — rejected, lets users write arbitrary regex against a hot loop; serious DoS / ReDoS risk. (2) Rule list in env as a JSON blob — rejected, opaque diffs, no type safety, regex-in-string is hostile to readers. (3) Hardcoded thresholds — rejected, defeats the point of having a config layer.
  - Trade-offs: Threshold changes don't re-filter existing articles — that's tracked as a Could feature, not a regression.

- **ADR: Article status enum extended with `pending_llm` (one-way enum addition)**
  - Context: The article state machine needs an intermediate slot between "passed pre-filter" and "LLM-processed". Reusing `raw` would lose the distinction between "never seen by pre-filter" and "passed pre-filter, waiting for LLM"; reusing `processed` would lie about LLM completion.
  - Decision: Add value `pending_llm` to `articles_status_enum`, positioned BEFORE 'processed' to read in state order (`raw → filtered → pending_llm → processed → error`). Postgres 12+ permits ALTER TYPE ADD VALUE inside a transaction so long as the new value isn't used in the same transaction — the migration does only the ADD, no DML.
  - Alternatives: (1) Replace the enum with a domain table — rejected, premature; the state list is bounded and rarely changes. (2) Boolean columns per stage — rejected, encodes the state machine implicitly across columns.
  - Trade-offs: Enum value removal in Postgres requires recreating the type and rewriting every dependent column. The migration's `down()` intentionally leaves `pending_llm` in place — documented as one-way. If a true rollback is needed, write a follow-up migration that recreates the enum.

- **ADR: Worker runs in the same Node process as backend (this milestone)**
  - Context: Workers can run in the API process (shared lifecycle, code, deps) or a separate container (better failure isolation, independent scaling).
  - Decision: Same process for now. The QueueModule registers queues, the FeedPollProcessor extends WorkerHost in the same NestJS app, OnApplicationShutdown closes cleanly.
  - Alternatives: Separate compose service from day one — rejected, premature; would need a second Dockerfile target and duplicate the boot wiring.
  - Trade-offs: A worker crash kills the API process and vice versa. Acceptable for milestone scope; tracked in tech debt for when worker count grows.

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
- [ ] Articles are stored per-user (duplicate content rows for two users subscribed to the same RSS feed). Cross-user article-content sharing is an optimization for storage, not a Must per spec; defer until traffic patterns justify it.
- [ ] Worker runs in the same Node process as the API. Split into a separate compose service when worker count exceeds two (or when one worker's CPU/memory profile starts crowding the API).
- [ ] Re-running the pre-filter after a threshold change is not implemented. Existing `filtered` and `pending_llm` articles stay in their current state when PREFILTER_MIN_CONTENT_LENGTH / PREFILTER_MAX_LINK_DENSITY change. Track as a Could feature — an admin endpoint that re-enqueues all `filtered` rows for re-prefiltering, or a background sweep.
- [ ] `filter_reason` is a free-form `varchar(64)`. The rule list is stable today (4 rules), but if it stabilizes further we should promote `filter_reason` to its own enum so invalid reasons fail at the DB layer instead of becoming a typo. Defer until the rule list has been touched at least once in production.
- [ ] **Remove `POST /debug/llm/analyze-test` before submission.** Temporary endpoint added to drive the e2e LLM verification. Lives in `packages/backend/src/llm/debug-llm.controller.ts`. Once the article-process worker is wired (next-but-one step), this endpoint can be deleted along with `DebugLlmController` from `LlmModule.controllers`.
- [ ] **Anthropic adapter + provider failover** — next step. The `LlmAdapter` interface is provider-neutral and the factory in `LlmModule` already branches on `LLM_ACTIVE_PROVIDER`; adding `'anthropic'` is a new adapter class + the factory branch. Failover (try one provider on error, fall back to the other) is a layer on top of the adapter rather than inside it — likely a small `FailoverAdapter` that wraps two real adapters.
- [ ] **`matchEntities` and `buildDigest`** are declared on `LlmService` but throw `NotImplementedException`. They land in the entity-dedup and digest steps respectively. The schemas for both are stubbed in `@feedgraph/shared/src/llm-types.ts` as `EntityMatch*`/`Digest*` so callers can reference the types early.
- [ ] **LLM cache has no TTL or eviction.** Content-hash determinism means we never need to invalidate for the same input, but cache rows accumulate forever. If we ever change the prompt for an operation, every existing cached entry becomes stale and the only safe thing is `DELETE FROM llm_cache WHERE operation = '…'` manually. Promote to a Could feature if cache size starts to matter or prompts iterate fast.
- [ ] **Entity fuzzy dedup (Microsoft / MSFT / Microsoft Corp.) is the `matchEntities` step — not implemented yet.** The `aliases` JSONB column on `entities` is in place for that step to populate. Until then, surface-form variants live as separate entity rows.
- [ ] **No re-queue mechanism for articles stuck in `pending_llm` after 3 worker retries.** BullMQ moves the job to the failed list and the article sits at `pending_llm` indefinitely. A future Could feature is a sweeper that picks up `pending_llm` articles older than N minutes and re-enqueues them.
- [ ] **`GET /debug/articles/:id` will be removed before submission** alongside `POST /debug/llm/analyze-test`. Both live in `DebugLlmController` (now mounted at `/debug` to host both endpoints) and exist purely to drive manual e2e verification.

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
