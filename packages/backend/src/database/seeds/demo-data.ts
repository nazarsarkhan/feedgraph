import type { ArticleImportance, ArticleStatus } from '../../articles/article.entity';
import type { GraphEntityType } from '../../graph-entities/graph-entity.entity';

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
  key: 'cloudflare' | 'openai' | 'hn';
  name: string;
  url: string;
}

export const DEMO_FEEDS: ReadonlyArray<DemoFeed> = [
  { key: 'cloudflare', name: 'Cloudflare Blog', url: 'https://blog.cloudflare.com/rss/' },
  { key: 'openai', name: 'OpenAI News', url: 'https://openai.com/blog/rss.xml' },
  { key: 'hn', name: 'Hacker News Front Page', url: 'https://news.ycombinator.com/rss' },
] as const;

export interface DemoEntity {
  canonicalName: string;
  type: GraphEntityType;
  aliases: readonly string[];
  description: string | null;
}

// 8 entities, cross-mentioned across articles to produce a meaningful graph.
// Aliases are real-world surface forms a future matchEntities pass would
// merge in; we seed two of them now so the field is visibly used.
export const DEMO_ENTITIES: ReadonlyArray<DemoEntity> = [
  { canonicalName: 'Cloudflare', type: 'company', aliases: ['CF'], description: null },
  { canonicalName: 'OpenAI', type: 'company', aliases: [], description: null },
  { canonicalName: 'Anthropic', type: 'company', aliases: ['ANTH'], description: null },
  { canonicalName: 'Microsoft', type: 'company', aliases: [], description: null },
  { canonicalName: 'GPT-5', type: 'product', aliases: [], description: null },
  { canonicalName: 'Claude', type: 'product', aliases: [], description: null },
  { canonicalName: 'Workers AI', type: 'product', aliases: [], description: null },
  { canonicalName: 'Llama 4', type: 'product', aliases: [], description: null },
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
];
