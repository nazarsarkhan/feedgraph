import { createHash } from 'crypto';
import type { LlmAdapter, LlmCallArgs, LlmCallResult } from './llm-adapter.interface';

const SIMULATED_LATENCY_MS = 200;
const IMPORTANCE_BIAS: ReadonlyArray<'high' | 'normal' | 'junk'> = [
  'high',
  'normal',
  'normal',
  'normal',
  'junk',
];

/**
 * First-class fake provider. Returns deterministic well-formed output for
 * the analyze_article operation so a reviewer can run the entire pipeline
 * without any API key. Determinism is driven by sha256(prompt), so the same
 * input always yields the same result — the LLM cache layer therefore
 * exercises the same hit / miss paths as it does for real providers.
 */
export class MockAdapter implements LlmAdapter {
  readonly providerName = 'mock';
  readonly modelName = 'mock-1';

  async ping(): Promise<void> {
    // The mock provider is always reachable — no network, no key.
  }

  async callJson<T>(args: LlmCallArgs<T>): Promise<LlmCallResult<T>> {
    await new Promise((resolve) => setTimeout(resolve, SIMULATED_LATENCY_MS));

    if (args.operation === 'match_entities') {
      return this.matchEntities(args);
    }
    if (args.operation === 'build_digest') {
      return this.buildDigest(args);
    }
    if (args.operation !== 'analyze_article') {
      throw new Error(`MockAdapter does not yet implement operation '${args.operation}'`);
    }

    const seedHex = createHash('sha256').update(args.prompt).digest('hex');
    const seed = parseInt(seedHex.slice(0, 8), 16);

    const titleMatch = args.prompt.match(/ARTICLE TITLE\n([^\n]+)/);
    const title = titleMatch?.[1]?.trim() ?? 'Untitled';
    const contentMatch = args.prompt.match(/ARTICLE CONTENT\n([\s\S]+?)\n\nOUTPUT FORMAT/);
    const content = (contentMatch?.[1] ?? '').replace(/\s+/g, ' ').trim();

    const summarySource = content.length > 0 ? content : title;
    const summary = `[mock] ${summarySource.slice(0, 180)}${summarySource.length > 180 ? '…' : ''}`;

    const importance = IMPORTANCE_BIAS[seed % IMPORTANCE_BIAS.length];

    // Reflect the user's actual axes back so axisAssignments has one entry
    // per axis, value=null (mock makes no claim). This keeps mock output
    // schema-valid for any user configuration the reviewer sets up.
    const axesSection = args.prompt.match(/USER AXES\n([\s\S]+?)\n\nARTICLE TITLE/)?.[1] ?? '';
    const axisAssignments = axesSection
      .split('\n')
      .filter((line) => line.startsWith('- '))
      .map((line) => {
        const nameMatch = line.match(/^- (.+?):/);
        return nameMatch ? { axis: nameMatch[1], value: null } : null;
      })
      .filter((x): x is { axis: string; value: null } => x !== null);

    const candidate = {
      summary,
      entities: [
        { name: 'Mock Corp', type: 'company' },
        { name: 'Acme Engine', type: 'technology' },
      ],
      importance,
      categoryHints: [],
      axisAssignments,
    };

    const parsed = args.schema.safeParse(candidate);
    if (!parsed.success) {
      throw new Error(
        `mock adapter: generated payload did not match schema (operation=${args.operation}): ${parsed.error.message}`,
      );
    }

    return {
      result: parsed.data,
      // Approximate token counts (4 chars ≈ 1 token) so telemetry dashboards
      // still have numbers to graph for the mock path.
      promptTokens: Math.max(1, Math.round(args.prompt.length / 4)),
      completionTokens: Math.max(1, Math.round(JSON.stringify(candidate).length / 4)),
    };
  }

  /**
   * Deterministic stand-in for the LLM's named-entity-resolution call.
   * Extracts the entity-list JSON the shared prompt embeds, then groups
   * by (type, normalized canonical name). Normalization is what a real
   * fuzzy matcher would catch first: NFKC (so unicode dash variants
   * collapse), lowercase, common legal suffixes stripped, all whitespace
   * + dash characters removed. The mock therefore catches:
   *   - "GPT-4o" vs "GPT‑4o" (unicode dash)
   *   - "Microsoft" vs "Microsoft Corp."
   *   - "Open AI" vs "OpenAI"
   * but doesn't try the harder cases (acronyms, descriptive merges) — a
   * real OpenAI/Anthropic call covers those. This is enough for the
   * default `LLM_ACTIVE_PROVIDER=mock` to demonstrate the pipeline
   * working end-to-end without an API key.
   */
  private matchEntities<T>(args: LlmCallArgs<T>): LlmCallResult<T> {
    const match = args.prompt.match(/ENTITIES TO ANALYZE\n([\s\S]+?)\n\nOUTPUT FORMAT/);
    let entities: Array<{ id: string; canonicalName: string; type: string; aliases: string[] }> =
      [];
    if (match) {
      try {
        entities = JSON.parse(match[1]) as typeof entities;
      } catch {
        // Mock falls back to empty mergeGroups on malformed prompt; safer
        // than throwing for a deterministic fallback.
        entities = [];
      }
    }

    const groups = new Map<
      string,
      Array<{ id: string; canonicalName: string; aliases: string[] }>
    >();
    for (const e of entities) {
      const norm = normalizeForMockMatch(e.canonicalName);
      if (norm.length === 0) continue;
      const key = `${e.type}|${norm}`;
      const bucket = groups.get(key);
      if (bucket) {
        bucket.push({ id: e.id, canonicalName: e.canonicalName, aliases: e.aliases ?? [] });
      } else {
        groups.set(key, [{ id: e.id, canonicalName: e.canonicalName, aliases: e.aliases ?? [] }]);
      }
    }

    const mergeGroups: Array<{
      canonicalId: string;
      duplicateIds: string[];
      aliases: string[];
      confidence: number;
    }> = [];
    for (const members of groups.values()) {
      if (members.length < 2) continue;
      // Input order is mention_count DESC (see EntityDedupService); the
      // first member is therefore the most-mentioned and a good default
      // canonical. Aliases union all surface forms + each member's prior
      // aliases, deduplicated.
      const [canonical, ...duplicates] = members;
      const aliasSet = new Set<string>();
      aliasSet.add(canonical.canonicalName);
      for (const a of canonical.aliases) aliasSet.add(a);
      for (const d of duplicates) {
        aliasSet.add(d.canonicalName);
        for (const a of d.aliases) aliasSet.add(a);
      }
      mergeGroups.push({
        canonicalId: canonical.id,
        duplicateIds: duplicates.map((d) => d.id),
        aliases: [...aliasSet],
        confidence: 0.9,
      });
    }

    const candidate = { mergeGroups };
    const parsed = args.schema.safeParse(candidate);
    if (!parsed.success) {
      throw new Error(
        `mock adapter: generated match_entities payload did not match schema: ${parsed.error.message}`,
      );
    }

    return {
      result: parsed.data,
      promptTokens: Math.max(1, Math.round(args.prompt.length / 4)),
      completionTokens: Math.max(1, Math.round(JSON.stringify(candidate).length / 4)),
    };
  }

  /**
   * Deterministic stand-in for the LLM's period-digest call. Parses
   * the prompt to extract article titles and the period label, then
   * generates a recognizable digest:
   *   - executiveSummary names a few extracted titles so the mock
   *     output is visibly tied to the input (not a constant string).
   *   - keyThemes pulls the most-common capitalized words from titles
   *     (a primitive stand-in for topic extraction).
   *   - sentiment is deterministic per (period, article-count).
   *   - topEntityNames are pulled from "ARTICLE TITLE" lines too;
   *     downstream DigestsService overrides this from the database
   *     anyway (the LLM's entity list is a hint, the SQL count is
   *     truth) so a rough mock here is fine.
   */
  private buildDigest<T>(args: LlmCallArgs<T>): LlmCallResult<T> {
    const periodMatch = args.prompt.match(/from the ([a-z]+ of [^\n.]+?) into a structured digest/);
    const period = periodMatch?.[1] ?? 'period';

    // Extract numbered article titles. Lines look like:
    //   N. [importance] Title text
    //      Optional summary line
    const titles: string[] = [];
    const titleRe = /^\s*(\d+)\.\s+\[[^\]]+\]\s+(.+)$/gm;
    let m: RegExpExecArray | null;
    while ((m = titleRe.exec(args.prompt)) !== null) {
      titles.push(m[2].trim());
      if (titles.length >= 30) break;
    }

    const seedHex = createHash('sha256').update(args.prompt).digest('hex');
    const seedInt = parseInt(seedHex.slice(0, 8), 16);
    const sentimentChoices: ReadonlyArray<'positive' | 'negative' | 'neutral' | 'mixed'> = [
      'positive',
      'neutral',
      'neutral',
      'mixed',
      'negative',
    ];
    const sentiment = sentimentChoices[seedInt % sentimentChoices.length];

    const headlineSample = titles.slice(0, 3);
    const executiveSummary =
      headlineSample.length === 0
        ? `[mock] Digest for the ${period}. No article titles parsed from prompt.`
        : `[mock] Digest for the ${period}. Notable items include ${headlineSample
            .map((t) => `"${t.length > 80 ? t.slice(0, 77) + '...' : t}"`)
            .join('; ')}.`;

    // Cheap theme extraction: count capitalized tokens of length 4+ across
    // titles, take the top 5. Deterministic and roughly correlates with
    // recurring topics in the dataset.
    const tokenCounts = new Map<string, number>();
    for (const t of titles) {
      const tokens = t.match(/\b[A-Z][A-Za-z][A-Za-z-]{2,}\b/g) ?? [];
      for (const tok of tokens) {
        tokenCounts.set(tok, (tokenCounts.get(tok) ?? 0) + 1);
      }
    }
    const keyThemes = [...tokenCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 5)
      .map(([token]) => token);
    if (keyThemes.length === 0) keyThemes.push('General news');

    const topEntityNames = keyThemes.slice(0, 5);

    const candidate = { executiveSummary, keyThemes, sentiment, topEntityNames };
    const parsed = args.schema.safeParse(candidate);
    if (!parsed.success) {
      throw new Error(
        `mock adapter: generated build_digest payload did not match schema: ${parsed.error.message}`,
      );
    }

    return {
      result: parsed.data,
      promptTokens: Math.max(1, Math.round(args.prompt.length / 4)),
      completionTokens: Math.max(1, Math.round(JSON.stringify(candidate).length / 4)),
    };
  }
}

// NFKC folds many unicode width / compatibility variants. Then lowercase,
// strip a handful of legal suffixes, and strip whitespace + every unicode
// dash codepoint (hyphen U+2010, non-breaking hyphen U+2011, figure dash
// U+2012, en dash U+2013, em dash U+2014, minus U+2212, soft hyphen U+00AD)
// so "GPT-4o" and "GPT‑4o" collapse, "Microsoft" and "Microsoft Corp."
// collapse. None of these are in the pre-commit's blocked range
// (U+200B-200D, U+FEFF, U+2060-206F) so the source is safe to check in.
function normalizeForMockMatch(name: string): string {
  return name
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[.,]/g, '')
    .replace(/\s+(corp|corporation|inc|llc|ltd|plc|sa|ag|pbc)\b/g, '')
    .replace(/[\s­‐‑‒–—−\-_]+/g, '')
    .trim();
}
