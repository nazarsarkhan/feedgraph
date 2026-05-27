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
- [x] LLM abstraction with OpenAI and Anthropic adapters, switchable via env
- [x] Structured output validation (zod) before persisting LLM results
- [ ] Article deduplication across feeds (URL + content hash) with "N similar" counter
- [ ] Entity deduplication (Microsoft / MSFT / Microsoft Corp. / Cyrillic spellings collapse to one node)
- [x] Cost control: token limit per article via env, LLM result cache by content hash, concurrency limit via env
- [x] Structured logging + LLM telemetry (calls, tokens, by operation)
- [x] Article feed with filters (category, feed, importance, time window)
- [x] Article card with summary, entities, categories, similar articles
- [ ] Graph page with react-flow, typed edges (mentions / co_mention / similar), filter by node type and category
- [x] Entity card with mentioning articles, related entities, mention frequency over time
- [ ] Settings UI for axes with "regenerate" action
- [ ] Regeneration worker with progress, non-blocking UI
- [ ] Bull Board (or equivalent) with basic-auth from env
- [x] One-command startup via `docker compose up` on a clean machine
- [x] Demo data seeding (script or demo feed) so reviewer sees a working graph within minutes
- [ ] README with setup instructions and Architectural Decisions section

## Should (heavily affects score, doesn't block acceptance)

- [x] Failover between LLM providers on error
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

- **ADR: Articles list uses two-stage query: paginated stage 1 + batch enrichment stage 2**
  - Context: The article-list endpoint must return articles enriched with feed name, entities, categories, and a cross-source similar-count, paginated and filterable. The naive approach — one big query with LEFT JOINs across `articles`, `feeds`, `article_entities`, `entities`, `article_categories`, `categories` — produces a cartesian product (one article × N entities × M categories = NM rows), which makes LIMIT/OFFSET pagination semantically broken (the page can cut a single article's rows in half) and forces a DISTINCT or GROUP BY that the planner has to reconcile with the ORDER BY.
  - Decision: Two stages. Stage 1 runs the paginated `SELECT id, … FROM articles WHERE …` with all filters applied (INNER JOIN to `article_categories` only when filtering by category) — single-table pagination on a single-table sort, exactly what the indexes are shaped for. Stage 2 takes the resulting article IDs and fires four batch queries in parallel (`Promise.all`) — feed names, entities, categories, similar counts — each `WHERE article_id = ANY(:ids)`. Total cost: 6 queries (count + page + 4 enrichments) regardless of page size. N+0, not N+1.
  - Alternatives: (1) One JOIN with `DISTINCT ON` — rejected, planner-fragile, harder to read, and the LIMIT semantics still operate on the joined row count, not the article count. (2) ORM-style relation loading with `.relations` and post-hoc deduplication — rejected, TypeORM still emits LEFT JOINs under the hood and the entity-tree builder slows down measurably above ~50 rows.
  - Trade-offs: 6 round-trips per page instead of 1. Acceptable: each is a sub-millisecond indexed lookup, and the queries run in parallel. The clarity win (each stage's SQL fits on a screen and uses indexes obviously) more than pays for it.

- **ADR: similar_count computed via batch GROUP BY, not per-article**
  - Context: "How many cross-source duplicates does this article have?" is a per-row property of the list, but computing it as `SELECT count(*) FROM articles WHERE content_hash = ? AND feed_id != ? …` once per row is the textbook N+1.
  - Decision: One batch query per page: `SELECT content_hash, feed_id, count(*) FROM articles WHERE user_id = $1 AND content_hash = ANY(:hashes) GROUP BY content_hash, feed_id`. The service then maps each article's `(content_hash, feed_id)` against the result to compute "rows in this article's content-hash cluster minus rows in this article's own feed" — i.e., cross-source duplicates only. One DB hit per page regardless of page size, and the GROUP BY uses the existing `(user_id, content_hash)` index.
  - Alternatives: (1) Per-row subquery — rejected, N+1. (2) Window function (`COUNT(*) OVER (PARTITION BY content_hash)`) wired into the stage-1 query — rejected, pulls the dedup logic back into the paginated query and forces the planner to compute the window across the user's whole table before LIMIT, defeating the offset cheapness.
  - Trade-offs: The service has to do a small in-memory cluster-vs-same-feed subtraction, which is a few lines of map manipulation. Cheap and isolated to one helper.

- **ADR: Articles are read-only over HTTP; mutations go through workers**
  - Context: There's no /articles POST/PATCH/DELETE in the spec or the user stories. Article status is owned by the feed-poll, prefilter, and article-process workers. Adding a write surface on the HTTP side would expose the state machine to clients that can't possibly satisfy the workers' invariants (e.g., setting `status=processed` without entity links).
  - Decision: ArticlesController exposes only `GET /articles` and `GET /articles/:id`. The only mutation surface for article rows is via the worker pipeline (and indirectly via `DELETE /feeds/:id` → ON DELETE SET NULL on the FK once that tech-debt item lands). Manual re-triggers happen at the feed level (`POST /feeds/:id/poll-now`), not the article level.
  - Alternatives: (1) Admin endpoints to manually mark articles `filtered`/`error` — rejected, no user story; workers can be re-queued via Bull Board if needed. (2) `PATCH /articles/:id/notes` for user-authored fields — rejected, no such field exists in the schema yet; defer until a feature actually wants it.
  - Trade-offs: A future "re-process this one article" feature has to enqueue at the worker layer rather than munging the row. That's the right shape, but it's documented here so a reviewer doesn't expect a write API.

- **ADR: Entities list mirrors articles list pattern (two-stage paginated + batch enrichment)**
  - Context: The entity-list endpoint has the same shape as articles — filterable, paginated, with per-row derived fields (here `mentionCount` instead of `similarCount`). The same JOIN-fan-out problem would apply: joining `entities` to `article_entities` would multiply rows per entity by their mention count, and the LIMIT semantics would cut entities in half.
  - Decision: Same two-stage pattern as `ArticlesListService`. Stage 1 paginates a single-table query on `entities` (with `WHERE user_id`, optional `type` enum filter, optional `ILIKE` on `canonical_name`, and an optional correlated subquery for `minMentions`). Stage 2 batches `mentionCount` via one `GROUP BY entity_id` over `article_entities WHERE entity_id = ANY(:ids)`. Same shape on detail: one entity row + `Promise.all` of mention count, mentioning articles, related entities, and mention timeline.
  - Alternatives: (1) Custom pattern per resource — rejected, the shape is too similar to justify diverging; consistency makes the code reviewable as a single idea. (2) Generic "list-with-enrichment" abstraction — rejected, premature; second instance is the wrong place to extract a framework, third instance is.
  - Trade-offs: A small amount of structural duplication between ArticlesListService and EntitiesListService (pagination math, the batch-load helpers, the COUNT-then-SELECT shape). Acceptable for two siblings; if a third list endpoint lands we'll extract a thin base class or a `listWithEnrichment` helper.

- **ADR: `minMentions` filter via correlated subquery, pre-aggregated path noted for scale**
  - Context: `minMentions` is a HAVING-style filter on a count from a related table. Two natural ways to express it: (a) a correlated subquery `(SELECT count(*) FROM article_entities WHERE entity_id = e.id) >= :n` inside the entity WHERE, or (b) pre-compute the qualifying IDs with a CTE / GROUP BY and use `WHERE e.id IN (…)`.
  - Decision: Correlated subquery. Postgres's planner is good at rewriting these, and at MVP scale (<10k entities/user, ~1-2 article_entities rows per entity at first, growing slowly) it runs in sub-millisecond. The same subquery doubles as the sort key when `sortBy=mentionCount`, so we don't compute the count twice. A comment in the code spells out the pre-aggregated alternative as the migration path when this starts to show up in slow logs.
  - Alternatives: (1) Pre-aggregated CTE today — rejected, more code, and the planner is allowed to choose the same plan from the subquery; we don't out-think it for a query that's fast. (2) Materialized `entity_mention_counts` table maintained by the article-process worker — rejected, premature; adds a write-path concern (consistency on retries, deletion cascades) that buys nothing at current volumes.
  - Trade-offs: Correlated subqueries can become hot if the outer relation is large. At ~10k entities the planner does ~10k inner counts unless it sees the rewrite. Tracked as tech debt with the concrete migration path.

- **ADR: Mention timeline at daily granularity; frontend aggregates further if needed**
  - Context: The entity card needs "mention frequency over time" (US-10). The granularity choice is a UI question masquerading as a backend one — too fine (per-hour) wastes payload, too coarse (per-month) hides spikes that the user cares about.
  - Decision: `DATE_TRUNC('day', COALESCE(published_at, created_at))` GROUP BY on the article-side, emitted as `{date: 'YYYY-MM-DD', count: number}`. `COALESCE` so Atom feeds that omit `pubDate` still count (rare but real). The frontend gets a consistent day-grain series and can re-bucket to weekly/monthly client-side using d3 or similar — no extra endpoint needed for that re-bucketing.
  - Alternatives: (1) Multiple granularities behind a `?granularity=` param — rejected, no user story for it yet; YAGNI. (2) Hourly grain — rejected, an article with 100 mentions across 2 days becomes 48 zero-buckets and 2 spikes, which is a frontend chart problem we don't need to invent. (3) Per-article events without aggregation — rejected, the chart has to aggregate anyway, doing it in Postgres is one indexed scan vs. shipping N rows.
  - Trade-offs: The "no data on this day" gaps are implicit (absent from the array) rather than zero-filled. Frontend has to fill gaps to render a continuous time axis; that's the right place for it (knows the visible window).

- **ADR: Anthropic adapter via Tool Use, not a JSON-mode equivalent**
  - Context: OpenAI's structured-output story is `response_format: { type: 'json_schema', strict: true }` — the model is constrained to emit a JSON object matching the schema. Anthropic has no native JSON-mode; the documented equivalent is forced Tool Use, where you declare a tool whose `input_schema` is the desired JSON Schema and set `tool_choice: { type: 'tool', name }` so the model MUST emit a tool_use block with `input` matching the schema.
  - Decision: AnthropicAdapter defines one tool named after the operation (e.g. `analyze_article`), sets its `input_schema` to the same JSON Schema we send to OpenAI strict mode (zod v4's `z.toJSONSchema`), and forces `tool_choice` to that tool. The adapter reads `response.content.find(c => c.type === 'tool_use').input` and re-validates with zod. Same defensive double-validation pattern as OpenAI: adapter validates, service re-validates.
  - Alternatives: (1) "Respond ONLY with JSON matching this schema" prompt-only — rejected, no constraint on the model and we'd be parsing free-text; defeats the point of an abstraction. (2) Beta JSON Schema helpers (`betaTool` / `betaZodTool` / `toolRunner`) — rejected for this milestone, they introduce multi-turn execution scaffolding we don't need (we never want Claude to call the tool's `run`); raw `messages.create` with a forced single tool is the simpler primitive.
  - Trade-offs: Tool Use carries slightly more prompt overhead than json_schema strict (the tool declaration tokens add up). At MVP article volumes, irrelevant. If a future operation needs vendor-specific features (e.g. extended thinking with structured output) the adapter is the right place to add per-vendor branches.

- **ADR: Failover triggers on provider-specific errors; request-shape errors propagate**
  - Context: The point of failover is soft degradation when the primary provider can't serve THIS call but a different provider can. The boundary that actually matters is "is the failure specific to this provider, or is it specific to our request?". 5xx, 429, and network blips are obviously the former. Auth (401/403) is also provider-specific in our setup, because each provider has independent credentials — an invalid `OPENAI_API_KEY` says nothing about whether `ANTHROPIC_API_KEY` works. The opposite class — 400, 404, 422 — points at the request itself (malformed JSON, unknown model name) and would repeat on the secondary given the same input.
  - Decision: Adapters classify their own errors. Retriable: HTTP 5xx, HTTP 429, HTTP 401, HTTP 403, network/timeout/abort (no `.status`), schema-mismatch on the parsed response. Non-retriable: 400, 404, 422 (request-shape errors that survive a provider swap). Adapters throw `LlmRetriableError` for retriable cases, plain `Error` otherwise. LlmService catches `LlmRetriableError` specifically to decide failover — anything else propagates unchanged.
  - Alternatives: (1) Failover on everything — rejected, doubles cost on genuine request-shape bugs. (2) HTTP-status-only classification (no network bucket) — rejected, network failures have no status and are the most common transient failure. (3) Retry primary N times before failover — rejected, BullMQ already retries the article-process job; a retry inside LlmService would multiply retry budgets without giving the operator a way to tune them separately. (4) Treat 401/403 as non-retriable like other 4xx — rejected after initial implementation: the "same fault on secondary" reasoning only holds when providers share credentials, which they explicitly don't in our multi-provider model.
  - Trade-offs: Schema-mismatch on the primary's response is classified retriable, even though it might mean the primary itself shipped a bug. We'd rather the secondary's call succeed and capture both rows in telemetry than fail an article on what looks like a transient model regression. Treating 401/403 as retriable means that if BOTH provider keys are misconfigured, we'll pay one wasted secondary call per attempt before propagating the failure — accepted as cheap insurance against single-provider auth outages (revoked key, expired token).

- **ADR: `LlmRetriableError` is the single failover signal across adapters**
  - Context: Failover policy needs to be readable in one place. If each adapter's error vocabulary leaked into LlmService (catch `OpenAIRateLimit | OpenAITimeout | AnthropicAPIError(status=5xx) | …`), every new provider would force a touch on the service.
  - Decision: A single `LlmRetriableError` class, lives in `adapters/llm-retriable-error.ts`. Every adapter classifies its own provider-specific errors and throws this class when failover should trigger; every other failure path throws a plain `Error`. `LlmService` does exactly one `if (err instanceof LlmRetriableError && this.failoverAdapter)` check. Adding a new provider means adding an adapter — no LlmService change.
  - Alternatives: (1) A retriable-error registry per provider with predicates — rejected, more surface area for the same outcome. (2) Error codes on a base class — rejected, classes-with-discriminants in Node have well-known instanceof pitfalls and we'd recreate the structured-error problem.
  - Trade-offs: `LlmRetriableError`'s contract (and the architectural decisions it implements) is now a stable API every adapter must follow. Documented in the class's JSDoc.

- **ADR: Failover result cached under failover-provider's model key**
  - Context: The LLM cache is keyed by `(content_hash, operation, model)`. When the primary fails over to the secondary and we successfully obtain a result, where do we cache it? Under the primary's model (so future primary calls are fast) or the secondary's (so the cache lane stays segregated by provider)?
  - Decision: Cache under the secondary's model. The cached row says "this content, this operation, this model produced this output" — pretending the primary produced it would be a lie that any future operator inspecting `(content_hash, model) → result` rows would have to debug. When the primary recovers, its next call on the same content is a cache miss against ITS own model lane (which is the right behaviour — re-validating that the recovered provider still produces sensible output).
  - Alternatives: (1) Cache under the primary's model — rejected, conflates which model authored what; future "audit which model produced this result" queries become impossible. (2) Skip the cache write on failover entirely — rejected, throws away a real result and forces a re-call on retry.
  - Trade-offs: The cache develops parallel lanes per provider. Storage cost is negligible (one extra JSONB row per failover-cached article). The behaviour difference compared to "always cache under primary" is: after primary recovers, the first call on a previously-failover'd article still costs one primary call. That's the right cost — it's how we re-confirm the recovered provider.

- **ADR: No circuit breaker; per-call failover only**
  - Context: With per-call failover, if the primary is broken for an hour every job pays the latency of one failed primary attempt before reaching the working secondary. A circuit breaker (open/half-open/closed) would skip the primary for a cool-off window after N failures.
  - Decision: Don't implement a circuit breaker in this milestone. Each call independently tries primary then secondary. The architecture is set up so that adding one later is a localized change inside LlmService (wrap the `try { await primary.callJson() }` in a breaker state machine; everything else stays).
  - Alternatives: (1) Add a token-bucket circuit breaker now — rejected, premature; we don't have observed primary outage patterns yet. (2) Track failure rate in Redis for multi-process coordination — rejected, multi-process is a future split; the breaker should match deployment topology when we have one.
  - Trade-offs: During a sustained primary outage, every job pays one failed-primary RTT (typically a few hundred ms for 5xx). At MVP article volumes that's a few seconds of wasted latency per outage; not worth the breaker's complexity yet. Tracked as tech debt.

- **ADR: Demo seed uses static fixtures, not live polling — guarantees reviewer experience without API keys**
  - Context: Spec section 6 requires a reviewer to see a working graph within minutes of `docker compose up`. The "obvious" approach — auto-add a real RSS feed for the demo user and let the pipeline run — has hard dependencies on the public internet, on the feed publishing recent items, and crucially on LLM API keys being configured. None of those hold on a fresh clone.
  - Decision: A pure-data seed module (`packages/backend/src/database/seeds/`) writes fully-processed articles directly into the database with all metadata (`summary`, `importance`, `entities`, `categories`, `axis_values`, `status`, `filter_reason`). No RSS polling, no LLM calls, no API keys required. The live pipeline still exists and the reviewer can exercise it independently by adding a real feed — but the demo doesn't depend on it. The seed produces a non-trivial graph (13 articles, 8 cross-mentioned entities, 4 categories) and exercises every visible pipeline state (`processed`, `filtered` for both prefilter and llm_junk reasons, `pending_llm` for the "in-flight" indicator).
  - Alternatives: (1) Seed feeds and trigger a real poll — rejected, requires public internet at boot AND working LLM credentials; reviewer experience degrades to "you also need an API key". (2) Seed a recorded HTTP response that the real pipeline replays — rejected, premature; would need a fixture-record mechanism in rss-parser + the LLM adapter just to keep one demo working.
  - Trade-offs: The fixtures bypass the worker pipeline, so the demo doesn't itself exercise feed-poll / prefilter / article-process / LLM cache / telemetry. Acceptable: those are tested elsewhere (every step in this branch was verified end-to-end), and the demo's job is to show the *product*, not the *pipeline*.

- **ADR: Demo seed is idempotent; destructive re-seed deliberately omitted**
  - Context: The seed is invoked on every backend boot when `SEED_DEMO_ON_BOOT=true`. Without idempotency it would either error (duplicate user email) or, worse, multiply demo articles every restart. Conversely, a destructive re-seed (DELETE-then-INSERT) is dangerous if invoked in an environment with real data — a deployment misconfiguration that flips this flag on production would wipe paying users' content.
  - Decision: `DemoSeedService.seed()` first checks `users WHERE email = 'demo@feedgraph.local'`. If present, it logs and returns. No `DELETE`, no `TRUNCATE`, no destructive code paths anywhere in the seed module. The CI/dev path for "I want a clean demo" is `docker compose down -v` (explicit volume wipe), not an in-app re-seed button.
  - Alternatives: (1) Destructive re-seed gated on `NODE_ENV !== 'production'` — rejected, environment-flag gating is the kind of mistake worth refusing to ship; one accidental NODE_ENV override and you've destroyed prod data. (2) Re-seed only when the demo dataset has changed (content-hash the fixtures) — rejected, the failure mode is the same: confidence that "this can't run in prod" is exactly what would cause it to run in prod.
  - Trade-offs: To intentionally refresh demo data after a fixtures change, the operator runs `docker compose down -v && docker compose up`. That's a slightly heavier process than an in-app refresh, but the asymmetry is appropriate: ten extra seconds of operator time vs. an irreversible data loss risk.

- **ADR: `SEED_DEMO_ON_BOOT` defaults true in docker-compose, false elsewhere; standalone CLI for manual runs**
  - Context: The seed should run automatically for the "fresh-clone reviewer" path (docker compose up) but should NOT run in unit tests or one-off scripts that share the env-schema. Two natural defaults — true everywhere, or false everywhere — both fail one of those paths.
  - Decision: `SEED_DEMO_ON_BOOT` defaults to `false` in `env.schema.ts` (the "shipped behaviour"). `docker-compose.yml` overrides it to `true` via the backend service's `environment` block. Unit tests / local dev that don't go through compose get the safe default. A standalone CLI (`npm run seed:demo`, wrapped around `NestFactory.createApplicationContext`) lets an operator trigger the seed manually in any environment without restarting the backend.
  - Alternatives: (1) Default true everywhere — rejected, would seed demo data into test databases. (2) Default true only when `NODE_ENV === 'development'` — rejected, conflates "is this dev?" with "should I seed?"; they're different questions. (3) Hide the seed behind a one-shot make target — rejected, breaks the spec requirement of "see a graph after `docker compose up`".
  - Trade-offs: Two places to keep in sync (env.schema default and compose env block). The compose block is documented inline as the official toggle for the reviewer-facing path, so a future operator reading either file finds the right context.

- **ADR: Frontend served by nginx with `/api/*` proxy — single-origin avoids CORS + Secure-cookie traps**
  - Context: The backend authenticates via an HttpOnly cookie with `SameSite=Lax`. Cross-origin browsers strip cookies on cross-site requests, and the SameSite/Secure rules around localhost-vs-127.0.0.1 vs. real domains are a long-standing trap. The two natural reverse-proxy hosts are (a) the backend itself (mount the SPA on Nest) or (b) a separate nginx in front of both.
  - Decision: Separate nginx container. It serves the built SPA from `/usr/share/nginx/html` and proxies `/api/*` and `/debug/*` to the backend service over the compose network. The browser only ever talks to `http://localhost:8080` — one origin, no CORS preflight, cookies attach without `SameSite=None;Secure` (which would require HTTPS even in dev). In production we'd swap the listener for TLS and the rest of the wiring stays the same.
  - Alternatives: (1) Mount the SPA on the backend Nest app — rejected, conflates concerns (Nest now ships static files, hot-reload is harder, scaling story is "scale the backend to scale the frontend"). (2) Serve from a CDN with a separate API host + CORS — rejected for this milestone, requires CORS allowlist, credential headers, and HTTPS to dodge SameSite=Strict.
  - Trade-offs: One extra container (nginx) in the dev stack. The trade buys us a model that mirrors the production deployment shape and avoids the cookie / CORS class of bugs entirely.

- **ADR: shadcn/ui copy-not-package model for ownership over component code**
  - Context: We need accessible, well-styled components without spending the milestone hand-rolling them. The shadcn/ui distribution model is unusual — it isn't an npm dependency; instead a CLI copies component source files (TS + Tailwind classes) into our repo. We own the code from that point on.
  - Decision: Adopt shadcn/ui with the `new-york` style and `slate` base color. Components live in `src/components/ui/`, as committed source. `components.json` is committed too so future `npx shadcn@latest add <name>` runs land their output in the right place. We can edit any component freely — there is no upstream to fight on overrides.
  - Alternatives: (1) MUI / Mantine / Chakra as an npm dep — rejected, locks us into the library's design system and component vocabulary; theming overrides become a separate language to learn. (2) Hand-rolled components on top of Radix primitives — rejected, that's exactly what shadcn already did for us; we'd be re-implementing the same code.
  - Trade-offs: Updates aren't automatic — when shadcn fixes a bug upstream we have to re-run `add <name>` to pull it in (and diff against our local edits if we made any). Acceptable for the milestone; the component set is small enough to maintain by hand.

- **ADR: TanStack Query owns server state, including the session**
  - Context: A real app's server state (current user, articles, entities) doesn't fit a "global store" mental model — it's cached, stale-able, refetched on focus, paginated. Putting it in Redux/Zustand re-implements every cache concern by hand.
  - Decision: TanStack Query is the only state container for server data. `useQuery(['me'])` is the current user; protected routes wait for that query and redirect on 401. No Redux/Zustand. UI-local state (form inputs, modal open/closed) stays in `useState`. A single QueryClient with `retry: false`, `refetchOnWindowFocus: false`, `staleTime: 30s` lives at the root.
  - Alternatives: (1) Redux Toolkit + RTK Query — rejected, RTK Query is fine but Redux adds boilerplate we don't need; TanStack Query has the better ergonomics for pure server-state. (2) Zustand for everything — rejected, no built-in async/caching primitives; we'd recreate them. (3) SWR — rejected, less feature-rich (mutations, infinite queries, devtools); TanStack Query is the same shape and more capable.
  - Trade-offs: TanStack Query devtools add ~30kB in dev (gated, not in prod bundle). `useQuery(['me'])` for the session is unusual at first glance — it's a "GET /auth/me" call exactly like any other server read, and treating it as such lets us reuse the same staleness + retry semantics everywhere.

- **ADR: Production-only Docker; local dev runs Vite on the host**
  - Context: A dev container with HMR has well-known frustrations on Windows (volume mount IO performance) and adds a second Docker image to maintain. The dev experience that actually matters is sub-second HMR on file save.
  - Decision: One frontend Dockerfile, production-only — two-stage build, nginx runtime. For UI iteration, devs run `npm run dev` from `packages/frontend` on the host; Vite serves at `:5173` and proxies `/api/*` to the Dockerized backend on `:3000`. The proxy path is identical to the production nginx behaviour, so a feature that works in `npm run dev` works in `docker compose up`.
  - Alternatives: (1) Dev container with `volumes: ['./packages/frontend:/app']` + `vite --host 0.0.0.0` — rejected for this milestone, Windows mount perf is unpredictable and the dual-Dockerfile maintenance cost is real. (2) Production-only image but no host-dev path — rejected, would force a 30-second image rebuild on every UI change.
  - Trade-offs: Devs need Node installed locally to iterate on the UI. Acceptable: we already require Node for the workspace scripts; Docker remains the path for reviewers and CI.

- **ADR: All routes scaffolded as placeholders in this step; auth gating arrives in the next step**
  - Context: The route table — `/articles`, `/articles/:id`, `/entities`, `/entities/:id`, `/feeds`, `/graph`, `/settings`, plus the auth flow `/login` / `/register` / `/confirm` — is known from the spec. We could build them feature-by-feature or scaffold everything at once with placeholder content.
  - Decision: Land every route as a stub (Card with a title and "Coming soon" body) in this milestone. The auth pages live outside `Layout`; everything else nests under it. No `<ProtectedRoute>` guard yet — every URL is publicly reachable until the next step wires `useQuery(['me'])` and the redirect-to-login logic.
  - Alternatives: (1) Build pages bottom-up — rejected, hides the navigation shape until late; reviewers can't probe the URL space. (2) Scaffold routes AND add the auth gate — rejected, conflates two changes; the gate has its own decisions (loading state, redirect strategy, return-to URL) and belongs in its own step.
  - Trade-offs: For the duration of this step, anyone hitting the deployed URL can see the placeholder versions of every page. Acceptable since they say "coming soon" and don't expose any data; tracked in tech debt with the explicit "until next step" qualifier.

- **ADR: Session as a TanStack Query resource at `['me']`; mutations invalidate / setQueryData for state transitions**
  - Context: A real app's "who is logged in" lives somewhere — global store, Context, or just inside the data layer. Adding a Context plus state container plus refresh logic for the session re-implements caching primitives we already have via TanStack Query. The session is server-state shaped exactly like every other server read (GET /auth/me with a cookie).
  - Decision: `['me']` is a TanStack Query like any other. `useMe()` (in `src/hooks/useMe.ts`) maps a 401 response to `null` rather than throwing, so consumers branch on `data: MeResponse | null` cleanly. Login mutation calls `queryClient.invalidateQueries({ queryKey: ['me'] })` on success → forces a refetch with the new cookie. Logout uses `setQueryData(['me'], null)` (instant UI update — header email disappears synchronously) THEN `invalidateQueries(['me'])` (consistency with the server) THEN `navigate('/login')`. The order matters: the user sees the header update before the navigation animation.
  - Alternatives: (1) React Context with `useReducer` for auth state — rejected, duplicates the cache/refetch story TanStack already provides. (2) Zustand store with manual fetch on mount — same. (3) A `useSession` wrapper that internally does the same thing but hides the query key — rejected, the bare query key is more discoverable; future code can subscribe to `['me']` without a special hook.
  - Trade-offs: Anyone reading the code needs to know the conceptual leap that "current user is a query". Documented here and in `useMe.ts`. Worth it for the consistency win.

- **ADR: ProtectedRoute renders a full-page loader during `isLoading` to avoid the redirect-flash**
  - Context: A protected route component that reads `useMe().data` and immediately decides "navigate to /login on null" runs into the classic SPA flash: on first mount the query is still in-flight, `data` is undefined, code paths that check `!data` send the user to /login, only to bounce them BACK once the query resolves. The user sees a quarter-second flash of the login page on every refresh.
  - Decision: ProtectedRoute branches on three states: `isLoading` (render a centered subtle loader — animated muted bars), `error` (render an error card with retry), or `data: null` / `data: MeResponse` (redirect or `<Outlet/>`). The loader view is a module-level constant so React doesn't recreate the JSX every render. The result: a fresh refresh of `/articles` shows the loader for a frame or two and then renders the page — never the login screen unless we're actually not authenticated.
  - Alternatives: (1) `placeholderData` returning a sentinel — rejected, conflates "loading" with "no data yet"; ProtectedRoute should be explicit about the three states. (2) Suspense + ErrorBoundary — viable but adds a layer (router-level Suspense boundary) we don't otherwise need yet. Defer until we have more async-loading routes.
  - Trade-offs: The loader is a few muted bars rather than a polished spinner; intentional — fewer milliseconds of visual noise on the path most users see most often.

- **ADR: Global 401 handler in `api.ts` invalidates `['me']`; `/auth/login` 401s are excluded as user errors**
  - Context: A session can disappear mid-page (cookie expired, server revoked the JWT, manual cookie deletion). Without a global handler, every protected screen would reimplement "if this 401s, redirect to login" — fragile, easy to miss.
  - Decision: `api.ts` holds a module-level QueryClient reference (set from `main.tsx` via `setQueryClient(qc)` to avoid a circular import). When any request returns 401, the global handler invalidates `['me']`. `useMe` then refetches, the new fetch returns null, ProtectedRoute redirects on the next render. The path `/auth/login` (and `/auth/register`) are excluded — a 401 from those endpoints means "wrong password / not confirmed", not "session expired"; the LoginPage catches the `ApiException` and renders the inline error itself.
  - Alternatives: (1) A TanStack Query global `onError` callback on the QueryClient — rejected, doesn't cover mutations or imperative fetches. (2) An Axios interceptor — same general idea but we'd be carrying Axios for one feature. (3) Each `useQuery` handles its own 401 — rejected, duplication and easy to miss.
  - Trade-offs: The QueryClient reference is set imperatively rather than provided via React's tree. Documented at the call site (`main.tsx`) and the setter site (`api.ts`); the indirection is explicit. The alternative — Provider-based — would force every imperative caller through a hook.

- **ADR: DEV MODE confirmation URL surfaced as a prominent post-registration card per spec section 3 (US-1)**
  - Context: Spec section 3 (US-1) requires that in dev mode, the confirmation link be surfaced "in the UI with a 'DEV MODE' label" AND in logs. Two natural places to put it: a toast/alert at the top of the screen, or replace the registration form with a confirmation-required screen. The link is the most important piece of UI on this screen — burying it in a toast undersells it.
  - Decision: On successful registration, the form area is REPLACED by a Card with title "Confirmation required", a "DEV MODE" pill badge, the confirmation URL rendered as a wrapped clickable link inside a bordered box, a "Copy URL" button (uses the Clipboard API with a 1.5-second "Copied!" feedback), and a "Go to login" link. The link uses `target="_blank"` so clicking opens a fresh tab; the user keeps the original window in the registration view in case they need to copy the URL again. The Card carries the URL all the way until they navigate away; refresh doesn't reset (we'd need to re-register to get a new token anyway). Also, the confirmation URL is constructed by the backend with `APP_URL=http://localhost:8080` (the SPA origin) so the link lands on the SPA's `/confirm` route, which reads the token and POSTs to the backend.
  - Alternatives: (1) Inline alert above the still-visible form — rejected, hides the most important next-step CTA below the fold. (2) Auto-redirect to `/confirm?token=...` — rejected, defeats the point of showing the link explicitly per spec wording. (3) Show the link as plain text — rejected, anchor + Copy button is dramatically more usable.
  - Trade-offs: The URL is wrapped (`break-all`) so on narrow viewports it spans 4-5 lines. Acceptable — clarity beats compactness here.

- **ADR: Feeds page uses card layout, not a table**
  - Context: A list view has two natural shapes — table (compact, sortable, dense) or cards (room for status, metadata, inline actions). The right choice depends on row count and per-row information density. Spec NFR-1 caps the realistic feed count at "≤10 per user", and each card carries: name, URL (often long), status badge, last-polled time, optional error message, and three actions.
  - Decision: Vertical stack of Cards, one per feed. Each Card has space for the URL on its own line (often 50-80 chars), the error message in destructive text when status='error', and three action buttons (Pause/Resume, Poll now, Delete) without cramping. Cards are full-width within the main content area so the URL doesn't wrap awkwardly. Loading state is three skeleton cards — same shape as the real cards so the layout doesn't reflow when data arrives.
  - Alternatives: (1) DataTable with row-expand for the URL — rejected, expand-rows are an extra click for information that should be glanceable. (2) Compact list with action menu (3-dot) — rejected, two of the three actions (Pause and Poll now) are common enough that hiding them behind a menu adds friction. (3) Hybrid table-of-cards (mobile cards / desktop table) — rejected, premature; the current shape works on both and a future tablet-and-up table can be added without invalidating the card-on-mobile path.
  - Trade-offs: Cards take more vertical space per row. At ≤10 feeds the whole list still fits on a single screen. If a future user has dozens of feeds we'd add pagination or a denser variant — tracked as a possible future refinement, not a current need.

- **ADR: Add Feed via shadcn Dialog; live-validation 422 displayed inline**
  - Context: Adding a feed requires the user to provide a URL and (optionally) a name, then waits while the backend's FeedValidatorService does a live `rss-parser` fetch — which can take seconds and can fail with a structured 422 ("Feed did not respond in time", "Response was not valid RSS/Atom XML", "Unexpected close tag at line 0 column 301"). The error needs to land somewhere the user can read and fix without losing context.
  - Decision: shadcn Dialog (Radix under the hood, a11y handled). Form lives inside the modal — URL + optional name. On 422 the dialog stays open and renders the backend's `message` verbatim in a destructive-tinted inline panel above the buttons. The form fields stay populated so the user can correct a typo without re-typing the long URL. On success the dialog closes, `queryClient.invalidateQueries(['feeds'])` runs, and a sonner toast confirms `Added <name>`.
  - Alternatives: (1) Inline form above the list — rejected, pushes the list down and makes the "I'm done adding feeds, take me back to the list" affordance ambiguous. (2) Separate `/feeds/new` route — rejected, full-page route for a 2-field form is heavy; navigation cost outweighs the form's complexity. (3) Toast the error and close on submit — rejected, the user loses the form context and has to re-open + re-paste the URL.
  - Trade-offs: The dialog can't display very long error messages without scrolling. The current backend errors are short enough to not matter; if we later wire a more verbose validator we'd add `max-h-32 overflow-y-auto` to the error panel.

- **ADR: Delete confirmation via shadcn AlertDialog, not `window.confirm()`**
  - Context: `window.confirm()` works but renders in the browser's native UI — different font, different button order across OSes, no theming, and a different visual register from the rest of the app. For an action that's destructive and visible, the confirmation should look like part of the product.
  - Decision: shadcn AlertDialog (a Radix primitive separate from Dialog — it carries the `role="alertdialog"` and the focus-trap semantics ARIA expects for confirmations). Title "Delete this feed?", description that names the specific feed and explains that articles will remain but lose their source link, Cancel (outline variant) + Delete (destructive variant) buttons. Clicking the destructive button fires `feedsApi.remove`; on success the dialog closes, the list refetches, a toast confirms. On error the dialog stays open with the message inline above the buttons (same pattern as AddFeedDialog).
  - Alternatives: (1) `window.confirm()` — rejected, see context. (2) Inline "are you sure?" double-tap on the Delete button — rejected, easier to confirm-by-accident and accessibility tooling has to be retrofitted. (3) Toast-with-undo (delete optimistically, give user 5 seconds to undo) — rejected for now, the cascade on delete (FK cascade clears link tables) makes "undo" semantically complicated; revisit if users actually misfire deletes.
  - Trade-offs: One more modal surface to test. Radix gives us focus management + ESC-to-close + outside-click-to-close for free, so the maintenance cost is small.

- **ADR: Manual poll → 202 + sonner toast + optimistic refetch after 8 seconds**
  - Context: `POST /feeds/:id/poll-now` returns 202 Accepted — the actual polling happens on the BullMQ worker, asynchronously. The frontend has no direct signal of when the poll completes. Without feedback the user sees nothing change for an unknown number of seconds and clicks the button again.
  - Decision: On 202, fire a sonner toast `Polling scheduled / Refreshing list in a few seconds.`, then `setTimeout(() => queryClient.invalidateQueries(['feeds']), 8000)`. Eight seconds is empirically long enough for the worker to finish on the demo feed scale, short enough that the user perceives the refresh as part of the same intent. The 8s is a constant in `FeedCard.tsx` (named `POLL_REFETCH_DELAY_MS`) so it's discoverable. The Poll now button is also disabled when the feed is `paused` (no poll happens against a paused feed) and during its own in-flight mutation.
  - Alternatives: (1) Poll the `/feeds` endpoint every second for 30 seconds until `lastPolledAt` advances — rejected, hammers the server for no good reason. (2) Wait for a WebSocket / SSE event — best long-term answer but requires backend infrastructure (event broker, auth on the SSE endpoint) we don't have yet. Tracked as tech debt. (3) Don't refetch; let the next nav or staleness trigger the refresh — rejected, the user clicked "Poll now" expecting immediate feedback.
  - Trade-offs: On a slow / failing poll the list refetches after 8s without the new data; the lastPolledAt timestamp stays the same and the user might assume nothing happened. Acceptable for MVP; the SSE upgrade in tech debt is the right way to remove the guess.

- **ADR: Toast notifications via `sonner`; replaces inline success messages from prior steps**
  - Context: The auth flow used inline success messages ("Confirmation email resent.") because toasts weren't wired yet. With the feeds page, we have several actions that succeed silently (pause, resume, delete, add) and benefit from a transient confirmation without permanent screen real-estate. Inline messages would clutter the cards.
  - Decision: `sonner` is shadcn's recommended toast library and integrates cleanly with the new-york style. A single `<Toaster />` is mounted at the App root (after `<Routes>`) with `richColors`, `closeButton`, and `position="bottom-right"`. All future feature pages emit via `toast.success(...)` / `toast.error(...)` from `'sonner'`. Inline success messages are retained ONLY for cases where the success carries data the user needs to keep around (e.g. the dev-mode confirmation URL in LoginPage's resend flow).
  - Alternatives: (1) `react-hot-toast` — comparable but doesn't ship a shadcn-compatible wrapper; we'd be styling against its defaults. (2) Notistack — overkill, queue-management features we don't need. (3) Roll our own — rejected, this is the kind of "looks easy until you handle stacking, ARIA, and animations" infrastructure.
  - Trade-offs: One more dependency in the bundle (~10kB gzip). Worth it — toasts are now the standard feedback channel for the rest of the app.

- **ADR: URL state sync via `useSearchParams`; `useArticleFilters` hook encapsulates parse/serialize**
  - Context: The articles list has six visible filters (status, importance, feed, category, from, to), pagination (page, pageSize), and sort (sortBy, order). State could live in `useState` inside ArticlesPage, in a Zustand store, or in the URL. The first two break the bookmark / share / reload story; the URL gives all three for free.
  - Decision: A single hook `useArticleFilters` in `src/hooks/` reads and writes the URL via React Router's `useSearchParams`. It exposes a typed `filters` object (parsed from the URL with enum validation — unknown values map to `undefined`, not "throw"), a `setFilter(key, value)` setter that updates the URL with `{ replace: true }` (no history flood), and a `reset()` helper. The hook is the only place that knows about query-string keys; the page and the filter bar consume `filters` and call `setFilter`. No shadow `useState` mirrors anywhere — the URL is the single source of truth.
  - Alternatives: (1) `nuqs` library — does this nicely with zod resolvers, but adds a dependency we don't need yet at six filters. Tracked as tech debt for when the dimension count grows. (2) `useState` + `useEffect` to sync to URL — rejected, the bidirectional sync is the bug-prone part of "store-and-mirror" patterns. (3) Zustand store with a custom URL adapter — overkill for a single page's state.
  - Trade-offs: Enum parsing is hand-rolled (`pickEnum(value, allowed)`). At six filters it's clearer than pulling in zod for this one purpose; if a third URL-state page lands we'd consolidate into a typed parser utility.

- **ADR: Filter changes apply instantly; page resets to 1 on any non-page change**
  - Context: Two questions land in the filter UX: (a) is there an Apply button, or do filters take effect on change? (b) what happens to the current page number when a filter changes — keep page 3, or reset to 1? Both have different correct answers in different products.
  - Decision: Filters apply on change (no Apply button). The `setFilter` implementation deletes `page` from the URL whenever the changed key is not itself `page`. That means going from "Page 3 of 5 with status=processed" to "Page 1 of 7 with status=filtered" happens in one click — the user sees results matching the new filter immediately and isn't stranded on a page that no longer exists. Page changes (clicking Next / Previous) leave other filters intact, naturally.
  - Alternatives: (1) Apply button — rejected, lists at MVP volumes refetch fast enough that the "instant" pattern is friendlier; we can revisit if a filter combo gets expensive. (2) Preserve page across filter changes — rejected, leads to the "Page 5 of 2 — Showing nothing" failure mode. (3) Preserve page only when valid (page <= newTotalPages) — rejected, adds complexity and the cases where it'd help are exotic.
  - Trade-offs: Every dropdown click triggers a refetch. With `placeholderData: keepPreviousData` and TanStack's request dedup, this is fine. If users tend to chain multiple filter changes in quick succession, we'd add a small debounce inside `setFilter` (e.g. 150ms via `useDeferredValue`).

- **ADR: `placeholderData: keepPreviousData` on `useArticles` for smooth refetch**
  - Context: Without placeholder data, every filter / page change unmounts the list, shows the skeleton view, then renders the new list. The "flash of skeleton" is jarring on a fast network and confuses users about whether their click did anything.
  - Decision: `useArticles` passes `placeholderData: keepPreviousData` (TanStack v5 import from `@tanstack/react-query`). The previous successful result is rendered while the new query is in flight; the page does NOT reset to its loading state. A thin animated progress bar (2 px tall, primary color, `animate-pulse`) is drawn between the header and the list whenever `isFetching && !isPending` — visible feedback that something is happening, but the list itself stays interactive.
  - Alternatives: (1) Skeleton on every change — rejected for the reason above. (2) Suspense + transitions — more code for the same outcome; the placeholderData primitive is the lowest-friction option. (3) No indicator at all — rejected; the user clicks a filter and the result lands a few hundred ms later; some intermediate signal is necessary.
  - Trade-offs: The user briefly sees stale data (the previous page) before the new result arrives. Acceptable: the data is bounded (one filter set ago, not days old), and the alternative (flash of empty / skeleton) is worse.

- **ADR: Article rows are dense list items, not Cards**
  - Context: The feeds page used Cards because feed counts are small (≤10) and each row carried multiple actions. Articles are different — counts run into thousands per spec, each row is read-once and typically clicked once. Cards would consume vertical space that's better spent showing more rows.
  - Decision: Each article is a single Link element with a flex layout — title + summary above, meta line (feed / time / categories / entity pills / similar count) below. Rows sit inside a bordered `<div className="rounded-md border divide-y">` container that draws a 1 px hairline between rows. Hover state lightens the row background (`hover:bg-accent/50`); the entire row is the clickable target. No Card per row, no shadow, no per-row padding accumulation.
  - Alternatives: (1) Cards per row — rejected, see context. (2) Plain `<a>` with no container — rejected, the bordered container gives the list visual identity and the divider proves where rows start and end. (3) Table — rejected, the meta line wraps to 4-6 inline tokens (feed name, time, categories, entity pills) that don't fit table columns gracefully.
  - Trade-offs: Mobile (narrow viewport) handling is less polished — the meta line wraps to several lines on a phone. Acceptable for the current scope; a `sm:` breakpoint that collapses pills into a count badge would tighten the mobile layout when the next person touches this view.

- **ADR: Filter bar is sticky on scroll for accessibility on long lists**
  - Context: With 20+ articles on screen and a 6-input filter bar, the user scrolls down to read article titles and then has to scroll all the way back up to change a filter. That's the "where did I lose my context" problem.
  - Decision: The ArticleFilterBar uses `position: sticky; top: 3.5rem;` (matching the global header's 14×4px height) so it pins to the top of the viewport as the user scrolls the article list past it. The negative horizontal margin + padding (`-mx-8 px-8`) makes the bar span the full main content width and gain a bottom border, so it visually separates from the list below it when stuck. `z-10` keeps it above the article rows but below modals (which use `z-50`).
  - Alternatives: (1) `position: fixed` — rejected, would need explicit width calculations to stay aligned with the main content area. (2) "Sticky on scroll" via JS — rejected, CSS `sticky` is the supported primitive for exactly this. (3) Floating action button to re-open filters — rejected, would hide the active filter state which is a primary navigation aid.
  - Trade-offs: On very short viewports the bar can occupy a meaningful chunk of the visible area. The bar wraps gracefully on narrow viewports (each filter on its own line) and the actual articles still scroll underneath, so usability survives even on a phone.

- **ADR: strictPropertyInitialization disabled in backend tsconfig**
  - Context: TypeORM @Column and class-validator DTO fields are populated by framework metadata/transform, not by constructors. TypeScript's strictPropertyInitialization rule demands constructor initialization and produces noise on every framework-managed field.
  - Decision: Set strictPropertyInitialization: false in packages/backend/tsconfig.json only. All other strict flags remain on.
  - Alternatives: (1) Use `!` definite-assignment assertion on every entity column and DTO field — rejected, ten files of noise per entity. (2) Use Prisma which doesn't have this issue — rejected, see TypeORM ADR. (3) Disable strict entirely — rejected, too broad.
  - Trade-offs: Loses compile-time check that other classes' fields are initialized in constructors, but the trade is scoped to the backend package; shared and frontend keep full strict.

- **ADR: ArticleEntity response shape includes id (backend) for entity navigation from articles**
  - Context: Both `GET /articles` and `GET /articles/:id` previously returned entities as `{ name, type }`. The article detail page wants every entity badge to deep-link to `/entities/:id`, so the frontend needs the entity's UUID alongside its label. Without `id` the UI would have to fetch + name-match against `/entities`, which races the unique constraint (per-user-lowercased(name)+type) and reintroduces a name-based lookup we worked hard to escape on the backend.
  - Decision: `ArticlesListService.loadEntitiesForArticles` selects `e.id AS entity_id` in addition to `e.canonical_name`/`e.type`. The `ArticleListItem.entities` and `ArticleDetail.entities` shapes both become `{ id, name, type }[]`. The frontend `ArticleEntity` mirrors this. No DB migration — this is a service-layer response change.
  - Alternatives: (1) Frontend resolves names → ids via a side request to `/entities?q=…` — rejected, two round-trips per entity badge and the name-match is ambiguous when aliases exist. (2) Embed only the id and have the UI fetch each entity's name lazily — rejected, every article row would N+1 the entity endpoint just to render a label that's already in scope.
  - Trade-offs: Payload grows by one UUID per (article × entity) link in the list view. At the demo's ~2 entities/article × 20 articles/page that's <1 KB extra per page; negligible against the entity-rendering benefit. Future link tables (categories, axis values) may want the same treatment for symmetry — handle on demand.

- **ADR: Article detail — two-column desktop, single-column mobile, sticky sidebar**
  - Context: The article detail view carries two distinct kinds of content: the body (title, summary, article HTML, similar articles) and the metadata sidecar (entities, categories, classification). A single linear layout buries the sidecar at the bottom on long articles; a fixed sidebar wastes space on narrow viewports.
  - Decision: A CSS-grid layout `grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-8`. Main column is fluid, sidebar is 280 px on `lg` and above. The sidebar uses `lg:sticky lg:top-20` so it pins below the global header while the article body scrolls. On smaller screens the sidebar drops below the main column in source order, which matches reading priority on phones.
  - Alternatives: (1) Tabs ("Article" / "Details") — rejected, hides the classification metadata that's part of the product's value proposition. (2) Collapsible sections — rejected, adds interaction overhead for a read-only display. (3) Flexbox with order swaps — rejected, CSS grid expresses "fixed-width sidebar, fluid main" more directly than flexbox can without explicit widths.
  - Trade-offs: 280 px is a round number, not a calculation against typical entity-name widths. If long entity names wrap awkwardly we'll widen to 320 px before fragmenting into a third column.

- **ADR: HTML content sanitized via DOMPurify with explicit allowlist; rendered via dangerouslySetInnerHTML**
  - Context: RSS `content_raw` arrives as HTML (paragraphs, links, images, occasional iframes/scripts depending on the publisher). Rendering as plain text loses the article's structure and breaks embedded media; rendering raw HTML opens stored XSS through any compromised or hostile feed.
  - Decision: Sanitize at render time with DOMPurify, using an explicit `ALLOWED_TAGS` list (`p, br, a, strong, em, b, i, u, h1–h4, ul, ol, li, blockquote, code, pre, img, span, div, figure, figcaption`) and `ALLOWED_ATTR` (`href, src, alt, title, target, rel`). `ALLOWED_URI_REGEXP` is locked to `^(https?|mailto):/i` so `javascript:` and `data:` URIs can't survive on `href` or `src`. The sanitized string then flows through `dangerouslySetInnerHTML`. Tailwind Typography (`prose prose-sm`) styles the result.
  - Alternatives: (1) Server-side sanitization at ingest — rejected for this step, the worker runs through too many HTML strings to be the bottleneck and a client-side allowlist gives us a single place to update if a new tag becomes dangerous. (2) Markdown-only render (strip all HTML) — rejected, loses inline images and meaningful structure for sources that publish rich HTML. (3) An iframe sandbox — rejected, adds layout complexity and breaks in-line links to entity badges. Re-evaluate (1) the moment we render the same article HTML in multiple views.
  - Trade-offs: Client-side sanitization runs on every detail view; cost is negligible (DOMPurify is fast). We accept that the rendered DOM may be slightly different from the source (e.g. event-handler attributes silently stripped) — that's the point. Verified via DOM-level inspection: `<script>` removed, `<img onerror=…>` reduced to bare `<img>` with `src=x` rejected, `<a href="javascript:…">` keeps text but loses href.

- **ADR: Graceful degradation per article status (processed / filtered / pending_llm / error / raw)**
  - Context: An article row's `status` enum spans the full pipeline — `raw` waiting for prefilter, `pending_llm` waiting for the worker, `filtered` for rules-rejected, `processed` for the success path, `error` for repeated worker failures. The detail page is mounted by any of these. Forcing a single "processed" layout would either crash on missing fields (summary, entities) or show empty UI scaffolding for rows that will never have those fields.
  - Decision: The page branches on `article.status`. `processed` gets the full layout (summary block, "Read original", sanitized content, similar-articles section, sidebar). `filtered` shows a notice with the filter reason + raw content; sidebar self-removes because its three sections are all empty. `pending_llm` mirrors filtered but with an "Awaiting analysis…" notice. `error` shows just the title and the failure reason. `raw` shows a "Queued for prefilter" notice. The sidebar's own component returns `null` when there's nothing to render, so the grid degrades from two columns to one without any conditional logic at the page level.
  - Alternatives: (1) Hide the detail page entirely for non-`processed` articles and 403 the route — rejected, users land on these from the list view and need feedback for why the article looks the way it does. (2) Always show the full layout with "—" placeholders — rejected, "no axes were assigned" reads identically to "we haven't analyzed this yet", which is confusing. (3) Separate routes for each status — rejected, the URL is an article identity, not a workflow state.
  - Trade-offs: Each status branch is its own JSX block, which adds repetition (back link, header, sidebar slot). Acceptable for clarity — the alternative is a render function with `if` ladders that's harder to scan when adding a new status.

- **ADR: Back navigation via explicit Link to /articles, not history.back()**
  - Context: The detail page is reachable via the row click (history exists), direct URL paste (no history), reload (history may exist but origin is opaque), or a navigation from the similar-articles section (history points to the previous article, not the list).
  - Decision: A persistent "← Articles" link in the page header points unconditionally to `/articles`. The link uses React Router's `<Link>` so it preserves the SPA navigation and TanStack Query caches survive the trip.
  - Alternatives: (1) `useNavigate(-1)` to go back in history — rejected, on direct-link arrivals it would dump the user on the previous origin (e.g. their email client) and after clicking through three similar articles it would walk backward through them instead of returning to the list. (2) Dynamic back target — read `document.referrer` and fall back to `/articles` — rejected, referrer is null on cross-origin and stripped under some referrer policies, so the fallback fires often enough that the "smart" branch is dead weight.
  - Trade-offs: User loses scroll position in the list when they return. We accept that for this step — the alternative (passing the list filter/scroll state through router state and restoring on return) is real work and not a verified pain point yet. Tracked as future tech debt if it bites.

Tech debt / refactor opportunities:

- [ ] CSRF protection. Deferred from the auth step. Cookie-delivered JWT + SameSite=Lax + same-origin frontend in dev gives us acceptable risk for the milestone, but production needs a CSRF token (double-submit or per-form synchronizer pattern). Track as a dedicated step.
- [ ] Articles → feeds FK with ON DELETE SET NULL. Spec: "видалення фіда не видаляє вже оброблені статті, але від'язує їх від живого джерела". The clause goes into the articles migration when we add the articles table; the current feeds delete is a hard delete with no FK to satisfy yet.
- [ ] AuthModule should re-export UsersModule for guards that need user lookup. Currently every feature module that mounts EmailConfirmedGuard must also explicitly import UsersModule — five importing modules now (Feeds, Categories, Axes, Articles, Entities). Refactor before adding a 6th: `@Module({ exports: [..., UsersModule] })` on AuthModule and drop the explicit UsersModule import everywhere else.
- [ ] Articles are stored per-user (duplicate content rows for two users subscribed to the same RSS feed). Cross-user article-content sharing is an optimization for storage, not a Must per spec; defer until traffic patterns justify it.
- [ ] Worker runs in the same Node process as the API. Split into a separate compose service when worker count exceeds two (or when one worker's CPU/memory profile starts crowding the API).
- [ ] Re-running the pre-filter after a threshold change is not implemented. Existing `filtered` and `pending_llm` articles stay in their current state when PREFILTER_MIN_CONTENT_LENGTH / PREFILTER_MAX_LINK_DENSITY change. Track as a Could feature — an admin endpoint that re-enqueues all `filtered` rows for re-prefiltering, or a background sweep.
- [ ] `filter_reason` is a free-form `varchar(64)`. The rule list is stable today (4 rules), but if it stabilizes further we should promote `filter_reason` to its own enum so invalid reasons fail at the DB layer instead of becoming a typo. Defer until the rule list has been touched at least once in production.
- [ ] **Remove `POST /debug/llm/analyze-test` before submission.** Temporary endpoint added to drive the e2e LLM verification. Lives in `packages/backend/src/llm/debug-llm.controller.ts`. Once the article-process worker is wired (next-but-one step), this endpoint can be deleted along with `DebugLlmController` from `LlmModule.controllers`.
- [ ] **Circuit breaker for repeated primary failures.** Per-call failover means every job pays the latency of one failed primary attempt during a sustained outage. Wrap LlmService's `try { primary.callJson }` in an open/half-open/closed breaker (in-process counter + cool-off window). Multi-process deployments would need Redis-backed coordination — match the breaker to the deployment topology when we split workers.
- [ ] **Health / probe endpoint for adapters (`GET /health/llm`).** Right now telemetry is the only signal of LLM-layer health. A lightweight probe (per-adapter `OPTIONS`-style ping, no real generation) feeding into `/health` would let oncall see provider state without grepping logs. Worth doing alongside the circuit breaker — they share the "is primary healthy?" signal.
- [ ] **`matchEntities` and `buildDigest`** are declared on `LlmService` but throw `NotImplementedException`. They land in the entity-dedup and digest steps respectively. The schemas for both are stubbed in `@feedgraph/shared/src/llm-types.ts` as `EntityMatch*`/`Digest*` so callers can reference the types early.
- [ ] **LLM cache has no TTL or eviction.** Content-hash determinism means we never need to invalidate for the same input, but cache rows accumulate forever. If we ever change the prompt for an operation, every existing cached entry becomes stale and the only safe thing is `DELETE FROM llm_cache WHERE operation = '…'` manually. Promote to a Could feature if cache size starts to matter or prompts iterate fast.
- [ ] **Entity fuzzy dedup (Microsoft / MSFT / Microsoft Corp.) is the `matchEntities` step — not implemented yet.** The `aliases` JSONB column on `entities` is in place for that step to populate. Until then, surface-form variants live as separate entity rows.
- [ ] **No re-queue mechanism for articles stuck in `pending_llm` after 3 worker retries.** BullMQ moves the job to the failed list and the article sits at `pending_llm` indefinitely. A future Could feature is a sweeper that picks up `pending_llm` articles older than N minutes and re-enqueues them.
- [ ] **Articles list lacks full-text search.** Spec lists FTS as a Should feature (graph + article list). For this step, the existing filters (category, feed, importance, status, time window) cover US-7. When FTS lands it'll likely be Postgres `tsvector` + GIN on `title + summary + content_raw` rather than introducing a separate search index.
- [ ] **Paginated `GET /entities/:id/articles` endpoint.** The entity-detail response caps `mentioningArticles` at 20 (most-recent first). A "see all articles mentioning this entity" view is a Should — easy follow-up: a paginated endpoint that reuses ArticlesListService's stage-1 query joined with `article_entities` on the entity id. No new query primitives needed.
- [ ] **`entity_co_mentions` materialized view.** The `relatedEntities` self-join (`article_entities × article_entities`) is sub-millisecond at MVP volumes but its cost grows as O(mentions²) per entity. If the entity-card endpoint slows, materialize the pair counts (`entity_a_id, entity_b_id, count`) and refresh after each article-process commit. Tracked here rather than implemented because the current query is fine and a materialized view adds a write-path concern (refresh on cascade deletes, ordering across worker retries).
- [ ] **Entity search uses `ILIKE`, no full-text or trigram index.** Fine at <10k entities/user; switches to `pg_trgm` GIN on `canonical_name` (or a tsvector column) once the table grows. The `entities_user_lower_name_type_unique` index covers the dedup write path but does not help substring lookups.
- [ ] **react-hook-form + zod resolver for complex forms.** Login / Register / Confirm all use HTML5 `required` + `minLength` and component-local `useState`. That's fine for short forms but doesn't scale to the Settings page (axes editor with array-of-values mutations) or future feed-creation flows. Switch when a form has more than three fields or needs cross-field validation.
- [x] ~~Toast notifications for success states.~~ Resolved with sonner — wired in App.tsx, used by feed actions (add / pause / resume / delete / poll-now). Future feature pages use the same pattern.
- [ ] **Real-time poll status via SSE / WebSocket.** Manual poll currently fires a 202, surfaces a sonner toast, and re-queries `/feeds` after a fixed 8-second delay. The window is fine for the demo's small feed sizes but is a guess: a slow poll completes after the refetch and the user sees stale data with no signal. An SSE endpoint (`/api/feeds/:id/events`) emitting `polled` / `error` would let `FeedCard` invalidate the moment the worker finishes. Needs an event broker on the backend; lift when the demo's "instant feedback" pattern starts failing.
- [ ] **Full-text search across articles** — Should feature from spec section 4.3 (US-7 / US-8). Currently the article list filters on category / feed / status / importance / time window, but not on title or body text. Backend would add a `q` query param and a `tsvector` GIN index on `title || ' ' || summary || ' ' || content_raw`; frontend adds a search input to the filter bar that debounces into `setFilter('q', value)`.
- [ ] **Numbered pagination** when datasets grow into thousands of articles. Prev/Next is fine for the demo's 13 rows and even for a few hundred, but a power user paging through 5,000 articles benefits from "jump to page 200" — add a numbered control beside the existing buttons (1, 2, 3, …, 198, 199, 200) when totalPages > 10. Cursor-based pagination on the backend (keyset on `(published_at, id)`) is the natural pairing.
- [ ] **`nuqs` or `zod-resolver` URL-state library** when filter dimensions multiply. The hand-rolled `pickEnum` + `setFilter` pattern in `useArticleFilters` scales fine for the articles page (6 filters), but if axes filters, source filters, or query syntax expand the URL surface, `nuqs` would give us a zod-typed schema with batched updates and proper history handling out of the box. Lift when we add the third URL-state page.
- [ ] **User timezone for absolute time display.** `date-fns/formatDistanceToNow` is relative ("3 minutes ago") and the `title` attribute carries the absolute ISO string in UTC. Reviewers in non-UTC zones would prefer their local time in the tooltip. Wire `formatInTimeZone` + a profile setting (or read `Intl.DateTimeFormat().resolvedOptions().timeZone`) when the Settings page lands.
- [ ] **Dev container with HMR.** Current frontend Dockerfile is production-only — devs run `npm run dev` on the host for HMR. If onboarding friction becomes a real cost (Windows Node toolchain issues, CI parity worries), add a `frontend-dev` compose service that mounts the source and runs `vite --host 0.0.0.0`. Track as Could.
- [x] ~~Auth route gating not yet implemented.~~ ProtectedRoute now wraps the layouted routes; useMe drives the auth state via TanStack Query at `['me']`. Resolved.
- [ ] **Optional live-demo mode for the seed.** The current seed inserts fully-processed fixtures; the live pipeline (feed-poll → prefilter → article-process → LLM) isn't exercised by the demo path. A "Could" extension would add a `SEED_DEMO_LIVE=true` mode that — after the fixtures land — also adds one or two real RSS feeds and triggers a real poll, so the reviewer can watch the pipeline execute in addition to inspecting the pre-seeded graph. Needs API keys, hence the separate flag.
- [ ] **Pagination is offset-based.** `page` + `pageSize` is simple, supports arbitrary jumps, and is fast at the data volumes the MVP cares about (≈10 feeds × ~30 articles/day). Switch to keyset (cursor) pagination if list-view performance degrades on heavy datasets — the natural cursor key is `(published_at, id)` because we already tie-break by id for stable ordering.
- [ ] **`GET /debug/articles/:id` will be removed before submission** alongside `POST /debug/llm/analyze-test`. Both live in `DebugLlmController` (now mounted at `/debug` to host both endpoints) and exist purely to drive manual e2e verification.
- [ ] **Entity badges in the articles list are non-interactive Badge elements, not Links.** The outer `ArticleRow` is already a `<Link to=/articles/:id>` and nesting a `<Link>` inside another `<Link>` is invalid HTML. Today entity badges are clickable only on the article detail page (the sidebar). Resolve by converting `ArticleRow`'s outer wrapper from `<Link>` to a `div` + `useNavigate` (or a button) so internal links are legal — then entity badges in the row become deep links too. Worth doing when the entity-detail page graduates from stub to product.
- [ ] **Sidebar entities are a flat list; group by type when count grows.** Today's articles top out at ~5 entities so a flat list is readable. Once we see articles with double-digit entities (post-`matchEntities` clustering surfaces canonical names with many aliases-as-mentions, or longer-form articles arrive), group the sidebar by `type` with a small uppercase subheader per group (Companies / People / Products / Technologies). Pure presentational refactor — no API change.
- [ ] **Paginated `/articles/:id/similar` endpoint** if a content-hash cluster grows large. Currently `loadSimilarArticles` caps at 10 server-side; that's fine for the demo (~2-article clusters) and for typical RSS cross-posting (~3–5 sources). When trending stories produce 50+ matches we'll need pagination on a dedicated endpoint instead of inlining the list in the article-detail payload. Cursor on `(published_at DESC, id)` to match the article list's ordering primitive.

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
