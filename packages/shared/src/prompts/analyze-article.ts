export interface AnalyzeArticlePromptInput {
  title: string;
  content: string;
  userCategories: readonly string[];
  userAxes: ReadonlyArray<{ name: string; values: readonly string[] }>;
}

// Truncation for safety — extremely long bodies will be cut to roughly
// keep us under any reasonable token cap. The deterministic prefilter
// already discards near-empty content, and downstream LLM token caps
// (LLM_MAX_TOKENS_PER_REQUEST) handle the completion side; this is just
// a sane upper bound on prompt size before encoding.
const MAX_CONTENT_CHARS = 12_000;

/**
 * Builds the analyze-article prompt. Prompts are business logic (what we
 * ask the model to do) and live in @feedgraph/shared so any adapter — and
 * any consumer — uses the same wording. Adapters carry the transport
 * concerns (auth, response_format, retries) but never the prompt text.
 */
export function buildAnalyzeArticlePrompt(input: AnalyzeArticlePromptInput): string {
  const { title, content, userCategories, userAxes } = input;

  const trimmedContent =
    content.length > MAX_CONTENT_CHARS
      ? `${content.slice(0, MAX_CONTENT_CHARS)}\n[...truncated ${content.length - MAX_CONTENT_CHARS} more chars]`
      : content;

  const categoriesBlock =
    userCategories.length > 0
      ? userCategories.map((c) => `- ${c}`).join('\n')
      : '(user has no categories yet — return an empty categoryHints array)';

  const axesBlock =
    userAxes.length > 0
      ? userAxes
          .map((ax) => `- ${ax.name}: one of [${ax.values.map((v) => `"${v}"`).join(', ')}]`)
          .join('\n')
      : '(user has no axes — return an empty axisAssignments array)';

  return `You are an analyst classifying a news article. Produce strictly structured JSON output.

TASK
Read the article below. Return:
1. summary: 1-3 sentences. No filler.
2. entities: people, companies, products, technologies, or locations explicitly mentioned. Skip vague references.
3. importance: 'high' for genuinely significant news; 'normal' for ordinary coverage; 'junk' for low-value content (press releases, sponsored posts, listicles, content that survived the deterministic prefilter but is still not worth indexing). Use 'junk' liberally — this is the LLM's filter pass.
4. categoryHints: zero or more category names from the user's list below. Skip if no category fits well.
5. axisAssignments: one entry per axis below. For each axis, pick exactly one of its allowed values, or null if no value fits.

USER CATEGORIES
${categoriesBlock}

USER AXES
${axesBlock}

ARTICLE TITLE
${title}

ARTICLE CONTENT
${trimmedContent}

OUTPUT FORMAT
Respond with ONE JSON object that matches the provided schema exactly. No markdown, no code fences, no commentary. axisAssignments must contain exactly one entry per axis listed above, in the same order; use null when no value fits.`;
}
