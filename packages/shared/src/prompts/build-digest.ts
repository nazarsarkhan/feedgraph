import type { DigestPeriodType } from '../llm-types';

export interface BuildDigestPromptInput {
  periodType: DigestPeriodType;
  // YYYY-MM-DD inclusive boundaries.
  periodStart: string;
  periodEnd: string;
  // Articles already filtered to the period at the SQL layer; the prompt
  // truncates to 50 to stay inside any model's context window. Sorting
  // by importance (high first) happens at the SQL layer so the truncation
  // preserves the most-important articles first.
  articles: ReadonlyArray<{
    title: string | null;
    summary: string | null;
    importance: string | null;
  }>;
}

const MAX_ARTICLES_IN_PROMPT = 50;

/**
 * Builds the buildDigest prompt. The articles are the user's classified
 * news for one calendar period — titles + LLM summaries only (NOT raw
 * content — keeping the prompt tight and bounded; see PLAN.md ADR).
 */
export function buildDigestPrompt(input: BuildDigestPromptInput): string {
  const periodLabel: Record<DigestPeriodType, string> = {
    day: `day of ${input.periodStart}`,
    week: `week of ${input.periodStart} through ${input.periodEnd}`,
    month: `month of ${input.periodStart.slice(0, 7)}`,
  };

  const truncated = input.articles.slice(0, MAX_ARTICLES_IN_PROMPT);
  const overflow = input.articles.length - truncated.length;

  const articleBlock = truncated
    .map((a, i) => {
      const title = a.title?.trim() ?? '(untitled)';
      const importance = a.importance ?? 'normal';
      const summary = a.summary?.trim();
      return summary
        ? `${i + 1}. [${importance}] ${title}\n   ${summary}`
        : `${i + 1}. [${importance}] ${title}`;
    })
    .join('\n\n');

  const overflowNote =
    overflow > 0
      ? `\n\n(${overflow} additional lower-importance articles from this period are omitted to stay within the prompt budget.)`
      : '';

  return `You are a news digest writer. Synthesize the ${input.articles.length} articles below from the ${periodLabel[input.periodType]} into a structured digest.

TASK
Read the articles. Produce:
1. executiveSummary: 2-4 sentence overview of the most important developments. Lead with what happened, not meta-commentary.
2. keyThemes: 3-8 recurring themes or topics as short phrases (e.g. "AI safety regulation", "GPT-5 rollout", "Cloudflare outage"). No duplicates, no near-duplicates.
3. sentiment: overall sentiment of the news coverage as one of: positive, negative, neutral, mixed. Use 'mixed' when the period has both significant good news and significant bad news; use 'neutral' for routine coverage with no clear positive/negative skew.
4. topEntityNames: up to 10 most-mentioned entities by canonical name (companies, products, people, technologies, locations). Order by salience to the period's narrative, not raw mention count.

Be concise and factual. Skip meta-commentary about the news cycle itself.

ARTICLES
${articleBlock}${overflowNote}

OUTPUT FORMAT
Respond with ONE JSON object that matches the provided schema exactly. No markdown, no code fences, no commentary.`;
}
