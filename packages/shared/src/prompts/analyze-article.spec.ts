import { buildAnalyzeArticlePrompt } from './analyze-article';

const BASE = {
  title: 'Test Article',
  content: 'Some content about technology.',
  userCategories: ['AI infrastructure', 'Research'],
  userAxes: [
    { name: 'Content type', values: ['news', 'analysis', 'tutorial'] },
    { name: 'Tone', values: ['neutral', 'promotional', 'critical'] },
  ],
} as const;

describe('buildAnalyzeArticlePrompt', () => {
  it('includes the article title', () => {
    expect(buildAnalyzeArticlePrompt(BASE)).toContain('Test Article');
  });

  it('includes the article content', () => {
    expect(buildAnalyzeArticlePrompt(BASE)).toContain('Some content about technology.');
  });

  it('lists all provided categories', () => {
    const prompt = buildAnalyzeArticlePrompt(BASE);
    expect(prompt).toContain('AI infrastructure');
    expect(prompt).toContain('Research');
  });

  it('lists all axis names and values', () => {
    const prompt = buildAnalyzeArticlePrompt(BASE);
    expect(prompt).toContain('Content type');
    expect(prompt).toContain('Tone');
    expect(prompt).toContain('"neutral"');
    expect(prompt).toContain('"promotional"');
    expect(prompt).toContain('"critical"');
  });

  it('truncates content above MAX_CONTENT_CHARS (12_000)', () => {
    // Build content well above the cap. The builder slices to 12_000 chars
    // and appends a short truncation notice — total prompt should stay
    // comfortably under the 15k slack figure used in the spec.
    const longContent = 'word '.repeat(5_000);
    const prompt = buildAnalyzeArticlePrompt({ ...BASE, content: longContent });
    expect(prompt).toContain('[...truncated');
    expect(prompt.length).toBeLessThan(15_000);
  });

  it('does NOT include the truncation notice for short content', () => {
    expect(buildAnalyzeArticlePrompt(BASE)).not.toContain('[...truncated');
  });

  it('returns a non-empty string', () => {
    const prompt = buildAnalyzeArticlePrompt(BASE);
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
  });

  it('handles empty userCategories with a graceful placeholder', () => {
    const prompt = buildAnalyzeArticlePrompt({ ...BASE, userCategories: [] });
    expect(prompt).toContain('user has no categories');
  });

  it('handles empty userAxes with a graceful placeholder', () => {
    const prompt = buildAnalyzeArticlePrompt({ ...BASE, userAxes: [] });
    expect(prompt).toContain('user has no axes');
  });

  it('emits axis lines in the order the caller supplied', () => {
    const prompt = buildAnalyzeArticlePrompt(BASE);
    const idxContentType = prompt.indexOf('Content type');
    const idxTone = prompt.indexOf('Tone');
    expect(idxContentType).toBeGreaterThan(-1);
    expect(idxTone).toBeGreaterThan(idxContentType);
  });
});
