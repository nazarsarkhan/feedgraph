import type { ArticleImportance, ArticleStatus } from '../../articles/article.entity';
import type { GraphEntityType } from '../../graph-entities/graph-entity.entity';

// The seed is idempotent at the user level: DemoSeedService.seed() checks
// for the demo user first and returns early if present. Expanding these
// fixtures therefore only takes effect on a fresh database (i.e.,
// `docker compose down -v && docker compose up`). Document this in the
// README so reviewers know how to refresh the seed if they want to see
// the expanded dataset.
export const DEMO_USER = {
  email: 'demo@feedgraph.local',
  password: 'demo123456',
} as const;

export const DEMO_CATEGORIES = [
  'AI infrastructure',
  'Model releases',
  'Research',
  'Industry news',
] as const;

export interface DemoFeed {
  key: 'cloudflare' | 'openai' | 'hn' | 'verge' | 'hugging' | 'deepmind';
  name: string;
  url: string;
}

export const DEMO_FEEDS: ReadonlyArray<DemoFeed> = [
  { key: 'cloudflare', name: 'Cloudflare Blog', url: 'https://blog.cloudflare.com/rss/' },
  { key: 'openai', name: 'OpenAI News', url: 'https://openai.com/blog/rss.xml' },
  { key: 'hn', name: 'Hacker News Front Page', url: 'https://news.ycombinator.com/rss' },
  { key: 'verge', name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml' },
  { key: 'hugging', name: 'Hugging Face Blog', url: 'https://huggingface.co/blog/feed.xml' },
  { key: 'deepmind', name: 'Google DeepMind', url: 'https://deepmind.google/blog/rss.xml' },
] as const;

export interface DemoEntity {
  canonicalName: string;
  type: GraphEntityType;
  aliases: readonly string[];
  description: string | null;
}

// 15 entities, cross-mentioned across articles to produce a meaningful graph.
// Aliases are real-world surface forms a future matchEntities pass would
// merge in; we seed two of them now so the field is visibly used.
export const DEMO_ENTITIES: ReadonlyArray<DemoEntity> = [
  { canonicalName: 'Cloudflare', type: 'company', aliases: ['CF'], description: null },
  { canonicalName: 'OpenAI', type: 'company', aliases: [], description: null },
  { canonicalName: 'Anthropic', type: 'company', aliases: ['ANTH'], description: null },
  { canonicalName: 'Microsoft', type: 'company', aliases: [], description: null },
  { canonicalName: 'Google', type: 'company', aliases: ['Alphabet'], description: null },
  { canonicalName: 'Apple', type: 'company', aliases: [], description: null },
  { canonicalName: 'Meta', type: 'company', aliases: ['Facebook'], description: null },
  { canonicalName: 'Hugging Face', type: 'company', aliases: ['HF'], description: null },
  { canonicalName: 'GPT-5', type: 'product', aliases: [], description: null },
  { canonicalName: 'Claude', type: 'product', aliases: [], description: null },
  { canonicalName: 'Workers AI', type: 'product', aliases: [], description: null },
  { canonicalName: 'Llama 4', type: 'product', aliases: [], description: null },
  { canonicalName: 'Gemini', type: 'product', aliases: [], description: null },
  { canonicalName: 'DeepMind', type: 'product', aliases: [], description: null },
  { canonicalName: 'M4', type: 'product', aliases: [], description: null },
] as const;

export interface DemoAxisAssignment {
  axis: string;
  value: string;
}

export interface DemoArticle {
  // Feed bucket (resolved to feedId at insert time).
  feedKey: DemoFeed['key'];
  title: string;
  url: string;
  // RSS-side raw fields.
  contentRaw: string;
  summaryRaw: string;
  author: string | null;
  // Pipeline state.
  status: ArticleStatus;
  filterReason: string | null;
  // Days BEFORE "now" — service spreads them along a 14-day window.
  publishedDaysAgo: number;
  // LLM-derived. Present only on status='processed' (and on 'filtered'
  // articles where filter_reason='llm_junk', because the LLM filled them
  // before tagging the article as junk).
  summary: string | null;
  importance: ArticleImportance | null;
  // Which entities (by canonicalName) this article mentions.
  entityMentions: readonly string[];
  // Category names (must match DEMO_CATEGORIES exactly).
  categories: readonly string[];
  // Axis assignments — value strings must exist on the corresponding default
  // axis (see DEFAULT_AXES in axes.service.ts).
  axisAssignments: readonly DemoAxisAssignment[];
  // Optional content_hash override. When unset, the seed computes
  // sha256(title + '\n' + contentRaw). Articles 1 and 6 share this value
  // to demonstrate the "similar across feeds" counter.
  contentHashOverride?: string;
}

// Article 1's hash is the "shared" hash for the cross-source dup demo.
// Spelled out as a constant so #6 can reference it explicitly — the
// invariant is testable by reading the file rather than running the seed.
// Must be exactly 64 chars to fit the content_hash varchar(64). This is
// sha256('demo-shared-workers-ai-custom-models').
export const DEMO_SHARED_CONTENT_HASH =
  '0c3bcb47bd6bdb1b1ec38b8b9b6c6cb0b4d3f3e9c2e63c8b6c9bdb5d0b4c1ea9';

// Second cross-feed dup: AlphaFold 3 on DeepMind blog + Hacker News thread.
// sha256('demo-shared-alphafold-3-protein-interactions'), 64 chars.
export const DEMO_SHARED_CONTENT_HASH_2 =
  '1a2b3c4d5e6f78901234567890abcdef1a2b3c4d5e6f78901234567890abcdef';

export const DEMO_ARTICLES: ReadonlyArray<DemoArticle> = [
  // 1 — Workers AI release on Cloudflare feed. Shared content_hash with #6.
  {
    feedKey: 'cloudflare',
    title: 'Workers AI now supports custom models',
    url: 'https://blog.cloudflare.com/workers-ai-custom-models/',
    contentRaw:
      'Workers AI now lets you bring your own fine-tuned weights to the edge. ' +
      'Upload a GGUF or safetensors file, point a Worker at it, and inference ' +
      'runs on the same global network that already serves Llama and other ' +
      'open models. Quotas, observability, and billing are unified with the ' +
      'rest of the Workers platform.',
    summaryRaw: 'Bring your own fine-tuned weights to Workers AI inference at the edge.',
    author: 'Cloudflare Engineering',
    status: 'processed',
    filterReason: null,
    publishedDaysAgo: 1,
    summary:
      'Cloudflare expands Workers AI to support customer-supplied fine-tuned models, ' +
      'putting bring-your-own weights on the same global edge network that serves ' +
      'their first-party model catalogue.',
    importance: 'normal',
    entityMentions: ['Cloudflare', 'Workers AI'],
    categories: ['AI infrastructure', 'Model releases'],
    axisAssignments: [
      { axis: 'Content type', value: 'release' },
      { axis: 'Reader level', value: 'middle' },
      { axis: 'Region', value: 'global' },
      { axis: 'Tone', value: 'promotional' },
    ],
    contentHashOverride: DEMO_SHARED_CONTENT_HASH,
  },

  // 2 — Performance article on Cloudflare feed.
  {
    feedKey: 'cloudflare',
    title: 'Edge inference latency improvements with new compilers',
    url: 'https://blog.cloudflare.com/workers-ai-compiler-improvements/',
    contentRaw:
      'We rewrote the Workers AI inference path on top of a new compiler ' +
      'stack and shaved an average of 40% off cold-start latency for the ' +
      'open-weights catalogue. The post walks through the bottleneck we ' +
      'identified in the previous tracing data, the kernel-fusion passes ' +
      'we added, and how we validated the result against a 2-week canary.',
    summaryRaw: '40% cold-start improvement on Workers AI from a compiler-stack rewrite.',
    author: 'Cloudflare Performance Team',
    status: 'processed',
    filterReason: null,
    publishedDaysAgo: 3,
    summary:
      'Compiler-stack rewrite on the Workers AI inference path cuts average cold-start ' +
      'latency by ~40%, validated with a two-week production canary.',
    importance: 'high',
    entityMentions: ['Cloudflare', 'Workers AI'],
    categories: ['AI infrastructure', 'Research'],
    axisAssignments: [
      { axis: 'Content type', value: 'analysis' },
      { axis: 'Reader level', value: 'senior' },
      { axis: 'Region', value: 'global' },
      { axis: 'Tone', value: 'neutral' },
    ],
  },

  // 3 — Operational deep-dive on Cloudflare feed.
  {
    feedKey: 'cloudflare',
    title: 'Investigating partial cache invalidation at scale',
    url: 'https://blog.cloudflare.com/partial-cache-invalidation/',
    contentRaw:
      'Partial cache invalidation sounds simple until your edge fleet is ' +
      'tens of thousands of machines and the request you want to invalidate ' +
      'fans out to a hundred origins. We describe the consistency model we ' +
      'settled on, the asynchronous fan-out machinery, and the failure ' +
      'modes we accept in exchange for sub-second propagation.',
    summaryRaw:
      'How we built partial cache invalidation on a fleet of tens of thousands of machines.',
    author: 'Cloudflare SRE',
    status: 'processed',
    filterReason: null,
    publishedDaysAgo: 5,
    summary:
      'Engineering write-up on the consistency model and fan-out machinery behind ' +
      "Cloudflare's partial cache invalidation, including the failure modes accepted " +
      'in exchange for sub-second propagation.',
    importance: 'normal',
    entityMentions: ['Cloudflare'],
    categories: ['AI infrastructure'],
    axisAssignments: [
      { axis: 'Content type', value: 'analysis' },
      { axis: 'Reader level', value: 'senior' },
      { axis: 'Region', value: 'global' },
      { axis: 'Tone', value: 'neutral' },
    ],
  },

  // 4 — Listicle-shaped junk caught by the LLM, not the prefilter.
  {
    feedKey: 'cloudflare',
    title: 'Click here for the top 10 best Cloudflare features',
    url: 'https://blog.cloudflare.com/top-10-best-cloudflare-features/',
    contentRaw:
      'You will not believe number 7! In this post we count down the absolute ' +
      'top 10 Cloudflare features you simply must know about right now. ' +
      'Number 10: caching. Number 9: also caching. Number 8: yes, more caching. ' +
      'Keep reading to find out what comes next, and please subscribe.',
    summaryRaw: 'Top 10 Cloudflare features you must know.',
    author: null,
    status: 'filtered',
    filterReason: 'llm_junk',
    publishedDaysAgo: 6,
    // LLM filled summary before deciding importance=junk → article filtered.
    summary:
      'Listicle of Cloudflare features framed in clickbait register; no actual ' +
      'product information beyond a vague reference to caching.',
    importance: null,
    entityMentions: ['Cloudflare'],
    categories: [],
    axisAssignments: [],
  },

  // 5 — Too-short content; caught by the deterministic prefilter.
  {
    feedKey: 'cloudflare',
    title: 'Quarterly update',
    url: 'https://blog.cloudflare.com/quarterly-update-2026-q2/',
    contentRaw: 'Q2 update coming soon.',
    summaryRaw: 'Q2 update coming soon.',
    author: null,
    status: 'filtered',
    filterReason: 'content_too_short',
    publishedDaysAgo: 7,
    summary: null,
    importance: null,
    entityMentions: [],
    categories: [],
    axisAssignments: [],
  },

  // 6 — Cross-source syndication of article 1. Same content_hash, different
  // feed_id, different URL — demonstrates the "N similar across feeds" counter.
  {
    feedKey: 'hn',
    title: 'Workers AI now supports custom models — duplicate URL test',
    url: 'https://news.ycombinator.com/item?id=42100001',
    contentRaw:
      'Workers AI now lets you bring your own fine-tuned weights to the edge. ' +
      'Upload a GGUF or safetensors file, point a Worker at it, and inference ' +
      'runs on the same global network that already serves Llama and other ' +
      'open models. Quotas, observability, and billing are unified with the ' +
      'rest of the Workers platform.',
    summaryRaw: 'Discussion of the Cloudflare Workers AI custom-models post on HN.',
    author: 'hn_submitter',
    status: 'processed',
    filterReason: null,
    publishedDaysAgo: 1,
    summary:
      'Hacker News thread on the Cloudflare Workers AI custom-models release; ' +
      'discussion centers on cold-start tradeoffs of running customer weights on ' +
      'shared edge infrastructure.',
    importance: 'normal',
    entityMentions: ['Cloudflare', 'Workers AI'],
    categories: ['AI infrastructure'],
    axisAssignments: [
      { axis: 'Content type', value: 'analysis' },
      { axis: 'Reader level', value: 'middle' },
      { axis: 'Region', value: 'global' },
      { axis: 'Tone', value: 'neutral' },
    ],
    contentHashOverride: DEMO_SHARED_CONTENT_HASH,
  },

  // 7 — OpenAI big model release; high importance.
  {
    feedKey: 'openai',
    title: 'GPT-5 release: deeper reasoning, vision improvements',
    url: 'https://openai.com/blog/gpt-5-release/',
    contentRaw:
      'GPT-5 is our next-generation flagship model. It improves substantially ' +
      'on multi-step reasoning, native vision capabilities, and instruction ' +
      'following over GPT-4o. The release notes cover the new evaluation ' +
      'suite, latency targets across deployment regions, and updated pricing.',
    summaryRaw: 'GPT-5 launch with reasoning, vision, and instruction-following gains.',
    author: 'OpenAI',
    status: 'processed',
    filterReason: null,
    publishedDaysAgo: 2,
    summary:
      'OpenAI launches GPT-5, with substantial gains on multi-step reasoning, ' +
      'native vision, and instruction following compared to GPT-4o.',
    importance: 'high',
    entityMentions: ['OpenAI', 'GPT-5'],
    categories: ['Model releases', 'Industry news'],
    axisAssignments: [
      { axis: 'Content type', value: 'release' },
      { axis: 'Reader level', value: 'middle' },
      { axis: 'Region', value: 'global' },
      { axis: 'Tone', value: 'promotional' },
    ],
  },

  // 8 — Research write-up on the same model.
  {
    feedKey: 'openai',
    title: 'Studying long-horizon reasoning failures in GPT-5',
    url: 'https://openai.com/blog/long-horizon-reasoning-failures/',
    contentRaw:
      'We share a study of failure modes that GPT-5 still exhibits on tasks ' +
      'that require dozens of correct reasoning steps in sequence. The post ' +
      'analyzes the failure distribution, isolates the most common error ' +
      'classes, and outlines the training signal changes we are evaluating ' +
      'to address them.',
    summaryRaw: 'Failure-mode analysis of long-horizon reasoning in GPT-5.',
    author: 'OpenAI Research',
    status: 'processed',
    filterReason: null,
    publishedDaysAgo: 4,
    summary:
      'OpenAI research post categorizes failure modes still exhibited by GPT-5 on ' +
      'multi-step reasoning chains and outlines training-signal changes under evaluation.',
    importance: 'normal',
    entityMentions: ['OpenAI', 'GPT-5'],
    categories: ['Research'],
    axisAssignments: [
      { axis: 'Content type', value: 'analysis' },
      { axis: 'Reader level', value: 'senior' },
      { axis: 'Region', value: 'global' },
      { axis: 'Tone', value: 'critical' },
    ],
  },

  // 9 — Industry / partnership news on OpenAI feed.
  {
    feedKey: 'openai',
    title: 'Microsoft and OpenAI extend partnership through 2030',
    url: 'https://openai.com/blog/microsoft-partnership-extension/',
    contentRaw:
      'Microsoft and OpenAI have extended their strategic partnership through ' +
      '2030, including renewed Azure compute commitments and a continued role ' +
      'for Microsoft as a preferred deployment partner for OpenAI models on ' +
      'enterprise infrastructure.',
    summaryRaw: 'Microsoft and OpenAI extend partnership through 2030.',
    author: 'OpenAI',
    status: 'processed',
    filterReason: null,
    publishedDaysAgo: 8,
    summary:
      'Microsoft and OpenAI extend their strategic partnership through 2030 with ' +
      'renewed Azure compute commitments and continued enterprise deployment role.',
    importance: 'normal',
    entityMentions: ['OpenAI', 'Microsoft'],
    categories: ['Industry news'],
    axisAssignments: [
      { axis: 'Content type', value: 'news' },
      { axis: 'Reader level', value: 'junior' },
      { axis: 'Region', value: 'US' },
      { axis: 'Tone', value: 'neutral' },
    ],
  },

  // 10 — Too-short OpenAI post; prefilter target.
  {
    feedKey: 'openai',
    title: 'Brief update from research blog',
    url: 'https://openai.com/blog/brief-update-research/',
    contentRaw: 'More soon.',
    summaryRaw: 'More soon.',
    author: null,
    status: 'filtered',
    filterReason: 'content_too_short',
    publishedDaysAgo: 9,
    summary: null,
    importance: null,
    entityMentions: [],
    categories: [],
    axisAssignments: [],
  },

  // 11 — Anthropic context window news, high importance.
  {
    feedKey: 'hn',
    title: 'Anthropic releases Claude with 1M token context',
    url: 'https://news.ycombinator.com/item?id=42100007',
    contentRaw:
      'Anthropic has shipped a Claude variant with a 1 million token context ' +
      'window, available initially through the API and to enterprise customers. ' +
      'The Hacker News thread compares the practical implications to existing ' +
      'long-context offerings and dissects the benchmarks cited in the release.',
    summaryRaw: '1M-token Claude variant lands; HN compares benchmarks to long-context rivals.',
    author: 'hn_submitter',
    status: 'processed',
    filterReason: null,
    publishedDaysAgo: 10,
    summary:
      'Anthropic ships a 1M-token-context Claude variant; community discussion picks ' +
      'apart the cited benchmarks and weighs the practical implications against rival ' +
      'long-context offerings.',
    importance: 'high',
    entityMentions: ['Anthropic', 'Claude'],
    categories: ['Model releases', 'Industry news'],
    axisAssignments: [
      { axis: 'Content type', value: 'news' },
      { axis: 'Reader level', value: 'middle' },
      { axis: 'Region', value: 'global' },
      { axis: 'Tone', value: 'neutral' },
    ],
  },

  // 12 — Meta / Llama 4.
  {
    feedKey: 'hn',
    title: 'Meta unveils Llama 4 with new training methodology',
    url: 'https://news.ycombinator.com/item?id=42100009',
    contentRaw:
      'Meta has announced Llama 4, with a new training methodology that they ' +
      'claim improves data efficiency by roughly 3x compared to Llama 3. The ' +
      'open weights are scheduled for staged release. The thread digs into ' +
      'the methodology paper and the reproducibility outlook.',
    summaryRaw: 'Llama 4 announcement; ~3x training data efficiency vs Llama 3.',
    author: 'hn_submitter',
    status: 'processed',
    filterReason: null,
    publishedDaysAgo: 11,
    summary:
      'Meta announces Llama 4 with a new training methodology claiming ~3x data ' +
      'efficiency over Llama 3; community discussion focuses on the methodology paper ' +
      'and reproducibility outlook.',
    importance: 'normal',
    entityMentions: ['Llama 4'],
    categories: ['Model releases'],
    axisAssignments: [
      { axis: 'Content type', value: 'release' },
      { axis: 'Reader level', value: 'middle' },
      { axis: 'Region', value: 'global' },
      { axis: 'Tone', value: 'neutral' },
    ],
  },

  // 13 — In-flight (pending_llm) — proves the state machine to the reviewer.
  {
    feedKey: 'hn',
    title: 'How we use Claude to triage support tickets',
    url: 'https://news.ycombinator.com/item?id=42100013',
    contentRaw:
      'A startup writes up how they wired Claude into their support pipeline ' +
      'to triage incoming tickets, route them to the right team, and draft ' +
      'first-pass replies. The post covers prompt iteration, the human-review ' +
      'checkpoints they kept, and the metrics that convinced them it was a net positive.',
    summaryRaw: 'Startup write-up on using Claude to triage support tickets.',
    author: 'hn_submitter',
    status: 'pending_llm',
    filterReason: null,
    publishedDaysAgo: 13,
    summary: null,
    importance: null,
    entityMentions: [],
    categories: [],
    axisAssignments: [],
  },

  // ---- expanded seed below: 13 more articles across 3 new feeds, plus
  // a cross-feed duplicate of the DeepMind AlphaFold post on Hacker News.

  // 14 — The Verge: Google Gemini in Workspace.
  {
    feedKey: 'verge',
    title: 'Google announces Gemini 2.0 integration across Workspace apps',
    url: 'https://www.theverge.com/2026/05/google-gemini-2-workspace',
    contentRaw:
      'Google announced that Gemini 2.0 is rolling out across Workspace this ' +
      'week — Docs, Sheets, Gmail, and Meet all get the upgraded reasoning ' +
      'model. The post details the migration path for existing Workspace Labs ' +
      'features and the new admin controls for enterprise tenants.',
    summaryRaw: 'Gemini 2.0 rolls out across Google Workspace apps.',
    author: 'The Verge Staff',
    status: 'processed',
    filterReason: null,
    publishedDaysAgo: 2,
    summary:
      'Google rolls out Gemini 2.0 across Workspace (Docs, Sheets, Gmail, Meet), ' +
      'replacing existing Labs features and adding admin controls for enterprise tenants.',
    importance: 'high',
    entityMentions: ['Google', 'Gemini'],
    categories: ['Model releases', 'Industry news'],
    axisAssignments: [
      { axis: 'Content type', value: 'news' },
      { axis: 'Reader level', value: 'middle' },
      { axis: 'Region', value: 'global' },
      { axis: 'Tone', value: 'promotional' },
    ],
  },

  // 15 — The Verge: Apple M4 benchmarks.
  {
    feedKey: 'verge',
    title: "Apple's M4 chip benchmarks show 30% performance leap",
    url: 'https://www.theverge.com/2026/05/apple-m4-benchmarks',
    contentRaw:
      "Apple's M4 chip lands in independent benchmarks roughly 30% faster than " +
      'the M3 on multi-core workloads, with the headline gains landing on ' +
      'neural-engine inference. The Verge walks through the test setup, the ' +
      'efficiency-core scheduling changes, and what the numbers mean for ' +
      'on-device AI workloads.',
    summaryRaw: 'Apple M4 benchmarks: 30% multi-core gains, big inference wins.',
    author: 'The Verge Staff',
    status: 'processed',
    filterReason: null,
    publishedDaysAgo: 4,
    summary:
      'Independent benchmarks place the Apple M4 about 30% ahead of M3 on ' +
      'multi-core, with the headline wins on neural-engine inference; useful context ' +
      'for on-device AI workloads.',
    importance: 'normal',
    entityMentions: ['Apple', 'M4'],
    categories: ['Industry news'],
    axisAssignments: [
      { axis: 'Content type', value: 'analysis' },
      { axis: 'Reader level', value: 'middle' },
      { axis: 'Region', value: 'global' },
      { axis: 'Tone', value: 'neutral' },
    ],
  },

  // 16 — The Verge: Meta Llama 4.1 multimodal.
  {
    feedKey: 'verge',
    title: 'Meta releases Llama 4.1 with multimodal capabilities',
    url: 'https://www.theverge.com/2026/05/meta-llama-4-1-multimodal',
    contentRaw:
      'Meta has released Llama 4.1, the first point release of its open-weights ' +
      'flagship to ship with native multimodal support. The new variant accepts ' +
      'image inputs alongside text, with weights and a permissive license ' +
      'available immediately on Meta AI and partner platforms.',
    summaryRaw: 'Llama 4.1 ships with native image-input support.',
    author: 'The Verge Staff',
    status: 'processed',
    filterReason: null,
    publishedDaysAgo: 6,
    summary:
      'Meta releases Llama 4.1 with native multimodal (image-input) support; weights ' +
      'and a permissive license land immediately on Meta AI and partner platforms.',
    importance: 'high',
    entityMentions: ['Meta', 'Llama 4'],
    categories: ['Model releases'],
    axisAssignments: [
      { axis: 'Content type', value: 'release' },
      { axis: 'Reader level', value: 'middle' },
      { axis: 'Region', value: 'global' },
      { axis: 'Tone', value: 'promotional' },
    ],
  },

  // 17 — Too-short Verge post; prefilter target.
  {
    feedKey: 'verge',
    title: 'Short update',
    url: 'https://www.theverge.com/2026/05/short-update',
    contentRaw: 'More details soon.',
    summaryRaw: 'More details soon.',
    author: null,
    status: 'filtered',
    filterReason: 'content_too_short',
    publishedDaysAgo: 5,
    summary: null,
    importance: null,
    entityMentions: [],
    categories: [],
    axisAssignments: [],
  },

  // 18 — Hugging Face: Transformers.js v4.
  {
    feedKey: 'hugging',
    title: 'Introducing Transformers.js v4 — run models in the browser',
    url: 'https://huggingface.co/blog/transformers-js-v4',
    contentRaw:
      'Transformers.js v4 is the biggest release of our in-browser inference ' +
      'library yet. WebGPU support is now stable, ONNX runtime is bundled by ' +
      'default, and a new streaming API lets you generate tokens with first-' +
      'token-latency competitive with server-side deployments.',
    summaryRaw: 'Transformers.js v4 with stable WebGPU and a streaming API.',
    author: 'Hugging Face',
    status: 'processed',
    filterReason: null,
    publishedDaysAgo: 3,
    summary:
      'Transformers.js v4 ships stable WebGPU support, bundled ONNX runtime, and a ' +
      'streaming token-generation API targeting server-side latency parity.',
    importance: 'normal',
    entityMentions: ['Hugging Face'],
    categories: ['AI infrastructure'],
    axisAssignments: [
      { axis: 'Content type', value: 'release' },
      { axis: 'Reader level', value: 'senior' },
      { axis: 'Region', value: 'global' },
      { axis: 'Tone', value: 'promotional' },
    ],
  },

  // 19 — Hugging Face: Llama 4 fine-tuning tutorial.
  {
    feedKey: 'hugging',
    title: 'Fine-tuning Llama 4 on custom datasets: a practical guide',
    url: 'https://huggingface.co/blog/fine-tuning-llama-4',
    contentRaw:
      'A practical walkthrough on fine-tuning Llama 4 with LoRA adapters on ' +
      'a custom domain dataset. Covers dataset formatting, the trainer ' +
      'configuration we recommend as a starting point, common pitfalls when ' +
      'the dataset is small or imbalanced, and how to evaluate against a ' +
      'held-out split before deploying.',
    summaryRaw: 'LoRA fine-tuning Llama 4 on custom domain data, with eval guidance.',
    author: 'Hugging Face',
    status: 'processed',
    filterReason: null,
    publishedDaysAgo: 5,
    summary:
      'Tutorial on LoRA-based fine-tuning of Llama 4 with custom domain data — ' +
      'covers data formatting, trainer config, small / imbalanced dataset pitfalls, ' +
      'and held-out evaluation before deployment.',
    importance: 'normal',
    entityMentions: ['Llama 4', 'Hugging Face'],
    categories: ['AI infrastructure', 'Research'],
    axisAssignments: [
      { axis: 'Content type', value: 'tutorial' },
      { axis: 'Reader level', value: 'senior' },
      { axis: 'Region', value: 'global' },
      { axis: 'Tone', value: 'neutral' },
    ],
  },

  // 20 — Hugging Face: Open LLM Leaderboard.
  {
    feedKey: 'hugging',
    title: 'Evaluating LLM reasoning with the new Open LLM Leaderboard',
    url: 'https://huggingface.co/blog/open-llm-leaderboard-reasoning',
    contentRaw:
      'The new iteration of the Open LLM Leaderboard focuses on reasoning ' +
      'benchmarks that resist contamination. We describe the task selection, ' +
      'the rolling evaluation cadence, and the first month of results across ' +
      'open weights and closed-API entries including OpenAI models.',
    summaryRaw: 'Reasoning-focused refresh of the Open LLM Leaderboard.',
    author: 'Hugging Face',
    status: 'processed',
    filterReason: null,
    publishedDaysAgo: 8,
    summary:
      'Hugging Face refreshes the Open LLM Leaderboard around contamination-resistant ' +
      'reasoning benchmarks; first month of results compares open weights to closed-API ' +
      'entries including OpenAI models.',
    importance: 'normal',
    entityMentions: ['Hugging Face', 'OpenAI'],
    categories: ['Research'],
    axisAssignments: [
      { axis: 'Content type', value: 'analysis' },
      { axis: 'Reader level', value: 'senior' },
      { axis: 'Region', value: 'global' },
      { axis: 'Tone', value: 'neutral' },
    ],
  },

  // 21 — In-flight Hugging Face article (pending_llm).
  {
    feedKey: 'hugging',
    title: 'Weekly model highlights — May 2026',
    url: 'https://huggingface.co/blog/weekly-highlights-2026-05',
    contentRaw:
      'A weekly roundup of the most notable open-weights model uploads to the ' +
      'Hub over the past seven days. This week features a strong showing for ' +
      'fine-tuned audio models and a surge in small specialised code models ' +
      'aimed at constrained deployment targets.',
    summaryRaw: 'Weekly roundup of notable Hub uploads.',
    author: 'Hugging Face',
    status: 'pending_llm',
    filterReason: null,
    publishedDaysAgo: 1,
    summary: null,
    importance: null,
    entityMentions: [],
    categories: [],
    axisAssignments: [],
  },

  // 22 — DeepMind: AlphaFold 3. Shared content_hash with #25 (HN dup).
  {
    feedKey: 'deepmind',
    title: 'AlphaFold 3 opens protein interaction predictions to researchers',
    url: 'https://deepmind.google/blog/alphafold-3-protein-interactions',
    contentRaw:
      'AlphaFold 3 extends the AlphaFold family beyond single-protein structure ' +
      'prediction to model protein-protein, protein-ligand, and protein-nucleic ' +
      'acid interactions. We are releasing the new model to academic researchers ' +
      'today with a non-commercial license and a hosted prediction service.',
    summaryRaw: 'AlphaFold 3 predicts protein interactions; academic access today.',
    author: 'Google DeepMind',
    status: 'processed',
    filterReason: null,
    publishedDaysAgo: 1,
    summary:
      'DeepMind releases AlphaFold 3, extending the family to protein-protein, ' +
      'protein-ligand, and protein-nucleic-acid interactions, with academic access ' +
      'available today through a hosted prediction service.',
    importance: 'high',
    entityMentions: ['Google', 'DeepMind'],
    categories: ['Research'],
    axisAssignments: [
      { axis: 'Content type', value: 'release' },
      { axis: 'Reader level', value: 'senior' },
      { axis: 'Region', value: 'global' },
      { axis: 'Tone', value: 'neutral' },
    ],
    contentHashOverride: DEMO_SHARED_CONTENT_HASH_2,
  },

  // 23 — DeepMind: Gemini for Science.
  {
    feedKey: 'deepmind',
    title: 'Gemini for Science: accelerating drug discovery with AI',
    url: 'https://deepmind.google/blog/gemini-for-science-drug-discovery',
    contentRaw:
      'Gemini for Science is a tuned variant of Gemini focused on scientific ' +
      'workflows. We describe collaborations with pharma research groups using ' +
      'it to triage candidate molecules, summarise relevant literature for a ' +
      'given mechanism of action, and propose synthesis routes for promising ' +
      'leads.',
    summaryRaw: 'Gemini-for-Science variant aimed at drug discovery workflows.',
    author: 'Google DeepMind',
    status: 'processed',
    filterReason: null,
    publishedDaysAgo: 3,
    summary:
      'DeepMind introduces Gemini for Science, a tuned variant aimed at pharma ' +
      'workflows — candidate triage, literature summarisation per mechanism of action, ' +
      'and synthesis-route proposals.',
    importance: 'normal',
    entityMentions: ['Google', 'Gemini'],
    categories: ['Research', 'Industry news'],
    axisAssignments: [
      { axis: 'Content type', value: 'analysis' },
      { axis: 'Reader level', value: 'senior' },
      { axis: 'Region', value: 'global' },
      { axis: 'Tone', value: 'promotional' },
    ],
  },

  // 24 — DeepMind: alignment opinion piece (co-mentions Anthropic).
  {
    feedKey: 'deepmind',
    title: "Building safe AI systems: DeepMind's approach to alignment",
    url: 'https://deepmind.google/blog/building-safe-ai-systems',
    contentRaw:
      'A position piece on how the DeepMind alignment team thinks about safety ' +
      'research in 2026: the threat models we take seriously, the work we are ' +
      'investing in directly, and where we collaborate with other labs ' +
      'including Anthropic on shared evaluation infrastructure.',
    summaryRaw: "DeepMind's 2026 position on alignment, with notes on cross-lab collaboration.",
    author: 'Google DeepMind',
    status: 'processed',
    filterReason: null,
    publishedDaysAgo: 7,
    summary:
      "Position piece on DeepMind's 2026 alignment agenda — the threat models, the " +
      'in-house investments, and shared-evaluation collaborations with other labs ' +
      'including Anthropic.',
    importance: 'normal',
    entityMentions: ['Google', 'DeepMind', 'Anthropic'],
    categories: ['Research'],
    axisAssignments: [
      { axis: 'Content type', value: 'opinion' },
      { axis: 'Reader level', value: 'senior' },
      { axis: 'Region', value: 'global' },
      { axis: 'Tone', value: 'neutral' },
    ],
  },

  // 25 — Too-short DeepMind post; prefilter target.
  {
    feedKey: 'deepmind',
    title: 'Q2 2026 research summary',
    url: 'https://deepmind.google/blog/q2-2026-summary',
    contentRaw: 'Summary post coming soon.',
    summaryRaw: 'Summary post coming soon.',
    author: null,
    status: 'filtered',
    filterReason: 'content_too_short',
    publishedDaysAgo: 9,
    summary: null,
    importance: null,
    entityMentions: [],
    categories: [],
    axisAssignments: [],
  },

  // 26 — Cross-feed dup of #22: AlphaFold 3 thread on Hacker News. Same
  // contentHashOverride as the DeepMind original, different feed_id and
  // URL — produces the second "N similar across feeds" cluster.
  {
    feedKey: 'hn',
    title: 'AlphaFold 3 opens protein interaction predictions — HN discussion',
    url: 'https://news.ycombinator.com/item?id=42100022',
    contentRaw:
      'AlphaFold 3 extends the AlphaFold family beyond single-protein structure ' +
      'prediction to model protein-protein, protein-ligand, and protein-nucleic ' +
      'acid interactions. We are releasing the new model to academic researchers ' +
      'today with a non-commercial license and a hosted prediction service.',
    summaryRaw: 'Hacker News discussion of the AlphaFold 3 announcement.',
    author: 'hn_submitter',
    status: 'processed',
    filterReason: null,
    publishedDaysAgo: 1,
    summary:
      'Hacker News discussion of the AlphaFold 3 release; thread weighs the non-' +
      'commercial license terms against the breadth of new interaction types the ' +
      'model now predicts.',
    importance: 'high',
    entityMentions: ['Google', 'DeepMind'],
    categories: ['Research'],
    axisAssignments: [
      { axis: 'Content type', value: 'news' },
      { axis: 'Reader level', value: 'senior' },
      { axis: 'Region', value: 'global' },
      { axis: 'Tone', value: 'neutral' },
    ],
    contentHashOverride: DEMO_SHARED_CONTENT_HASH_2,
  },
];
