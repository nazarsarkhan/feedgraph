import {
  PREFILTER_RULES,
  type PrefilterArticleView,
  type PrefilterThresholds,
} from './prefilter.service';

// We test the exported rule list directly, not the service. PrefilterService
// wraps the rules in DB/queue side effects which require a NestJS container;
// the rules themselves are pure predicates and that's where bugs live.

const THRESHOLDS: PrefilterThresholds = {
  minContentLength: 300,
  maxLinkDensity: 0.4,
};

const VALID_BODY = 'a'.repeat(400);
const BASE: PrefilterArticleView = {
  title: 'A meaningful article title about technology',
  contentRaw: VALID_BODY,
};

function ruleByName(name: string) {
  const rule = PREFILTER_RULES.find((r) => r.name === name);
  if (!rule) throw new Error(`rule ${name} not registered`);
  return rule;
}

describe('PREFILTER_RULES', () => {
  describe('missing_title rule', () => {
    const rule = ruleByName('missing_title');

    it('flags article with null title', () => {
      expect(rule.check({ ...BASE, title: null }, THRESHOLDS)).toBe(true);
    });

    it('flags article with empty title', () => {
      expect(rule.check({ ...BASE, title: '' }, THRESHOLDS)).toBe(true);
    });

    it('flags article with whitespace-only title', () => {
      expect(rule.check({ ...BASE, title: '   \n  ' }, THRESHOLDS)).toBe(true);
    });

    it('passes article with a real title', () => {
      expect(rule.check(BASE, THRESHOLDS)).toBe(false);
    });
  });

  describe('content_too_short rule', () => {
    const rule = ruleByName('content_too_short');

    it('flags content below threshold', () => {
      expect(rule.check({ ...BASE, contentRaw: 'short' }, THRESHOLDS)).toBe(true);
    });

    it('flags null content', () => {
      expect(rule.check({ ...BASE, contentRaw: null }, THRESHOLDS)).toBe(true);
    });

    it('passes content at exactly the threshold', () => {
      expect(rule.check({ ...BASE, contentRaw: 'a'.repeat(300) }, THRESHOLDS)).toBe(false);
    });

    it('treats whitespace as not-content', () => {
      expect(rule.check({ ...BASE, contentRaw: '   \n   ' }, THRESHOLDS)).toBe(true);
    });
  });

  describe('clickbait_title rule', () => {
    const rule = ruleByName('clickbait_title');

    // Pattern requires `^\d+\s+(best|top|things|ways|reasons|signs)` for
    // the listicle rule — the title must begin with a number.
    const clickbaitTitles = [
      '10 things you must know',
      '5 best ways to boost productivity',
      '7 reasons React is winning',
      'Click here for the best results',
      "You won't believe what happened next",
      'SHOCKING revelation about AI',
    ];

    for (const title of clickbaitTitles) {
      it(`flags clickbait: "${title.slice(0, 40)}…"`, () => {
        expect(rule.check({ ...BASE, title }, THRESHOLDS)).toBe(true);
      });
    }

    it('does not flag a legitimate title', () => {
      expect(
        rule.check(
          { ...BASE, title: 'Rust 2026 edition released with async improvements' },
          THRESHOLDS,
        ),
      ).toBe(false);
    });

    it('does not flag when title is null (defers to missing_title rule)', () => {
      expect(rule.check({ ...BASE, title: null }, THRESHOLDS)).toBe(false);
    });
  });

  describe('high_link_density rule', () => {
    const rule = ruleByName('high_link_density');

    it('flags content that is mostly links', () => {
      // Many anchors with negligible non-link text.
      const linkHeavy = '<a href="x">click me here</a> '.repeat(50) + 'tiny';
      expect(rule.check({ ...BASE, contentRaw: linkHeavy }, THRESHOLDS)).toBe(true);
    });

    it('passes a normal article with one inline link', () => {
      const normal = 'Normal article body with prose. '.repeat(40) + '<a href="x">one link</a>';
      expect(rule.check({ ...BASE, contentRaw: normal }, THRESHOLDS)).toBe(false);
    });

    it('passes null content (defers to content_too_short)', () => {
      expect(rule.check({ ...BASE, contentRaw: null }, THRESHOLDS)).toBe(false);
    });

    it('passes content with no links at all', () => {
      expect(rule.check({ ...BASE, contentRaw: 'a'.repeat(400) }, THRESHOLDS)).toBe(false);
    });
  });

  describe('rule ordering', () => {
    it('lists all four rules in priority order', () => {
      expect(PREFILTER_RULES.map((r) => r.name)).toEqual([
        'missing_title',
        'content_too_short',
        'clickbait_title',
        'high_link_density',
      ]);
    });
  });
});
