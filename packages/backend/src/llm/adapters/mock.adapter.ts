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

  async callJson<T>(args: LlmCallArgs<T>): Promise<LlmCallResult<T>> {
    await new Promise((resolve) => setTimeout(resolve, SIMULATED_LATENCY_MS));

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
}
