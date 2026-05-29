import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { Article, type FilterReason } from '../articles/article.entity';
import type { Env } from '../config/env.schema';
import { QUEUE_NAMES } from '../queue/queue-names';

// Reasons a deterministic rule can assign. Subset of FilterReason (excludes
// 'llm_junk', which is the LLM worker's verdict, not a prefilter rule).
export type PrefilterReason = Exclude<FilterReason, 'llm_junk'>;

// Multi-tenant note: prefilter operates on a single article by id, supplied
// from a trusted enqueue path (FeedPollService). Tenancy is enforced upstream
// — this service does not re-check user ownership.

export interface PrefilterThresholds {
  minContentLength: number;
  maxLinkDensity: number;
}

export interface PrefilterArticleView {
  title: string | null;
  contentRaw: string | null;
}

export interface PrefilterRule {
  name: PrefilterReason;
  check(article: PrefilterArticleView, thresholds: PrefilterThresholds): boolean;
}

export interface PrefilterOutcome {
  status: 'filtered' | 'pending_llm';
  reason: PrefilterReason | null;
}

// Clickbait detection — conservative starting set. Patterns are anchored
// loosely to common SEO templates so we filter the obvious cases without
// over-rejecting legitimate listicles.
const CLICKBAIT_PATTERNS: readonly RegExp[] = [
  /^\d+\s+(best|top|things|ways|reasons|signs)\b/i,
  /\bclick\s+here\b/i,
  /\byou\s+won'?t\s+believe\b/i,
  /\bshocking\b/i,
];

// HTML helpers. We don't pull in a parser — RSS bodies are typically small,
// and a naive regex is good enough for ratio estimation. The link-density
// rule is a heuristic, not a parser.
const ANCHOR_PATTERN = /<a\b[^>]*>([\s\S]*?)<\/a>/gi;
const TAG_PATTERN = /<[^>]+>/g;

/**
 * Ordered list of deterministic filter rules. Cheapest first. The first rule
 * whose `check` returns `true` marks the article as filtered and its `name`
 * is stored as `filter_reason`. Exported for unit tests in a future step.
 */
export const PREFILTER_RULES: readonly PrefilterRule[] = [
  {
    name: 'missing_title',
    check: ({ title }) => !title || title.trim().length === 0,
  },
  {
    name: 'content_too_short',
    check: ({ contentRaw }, { minContentLength }) => {
      const trimmed = (contentRaw ?? '').trim();
      return trimmed.length < minContentLength;
    },
  },
  {
    name: 'clickbait_title',
    check: ({ title }) => {
      if (!title) return false;
      return CLICKBAIT_PATTERNS.some((re) => re.test(title));
    },
  },
  {
    name: 'high_link_density',
    check: ({ contentRaw }, { maxLinkDensity }) => {
      if (!contentRaw) return false;
      let anchorChars = 0;
      for (const match of contentRaw.matchAll(ANCHOR_PATTERN)) {
        anchorChars += match[1].replace(TAG_PATTERN, '').length;
      }
      const textChars = contentRaw.replace(TAG_PATTERN, '').length;
      if (textChars === 0) return false;
      return anchorChars / textChars > maxLinkDensity;
    },
  },
];

@Injectable()
export class PrefilterService {
  private readonly logger = new Logger(PrefilterService.name);

  constructor(
    @InjectRepository(Article) private readonly articles: Repository<Article>,
    private readonly config: ConfigService<Env, true>,
    @InjectQueue(QUEUE_NAMES.ARTICLE_PROCESS) private readonly processQueue: Queue,
  ) {}

  /**
   * Runs each PREFILTER_RULE against the article in order. First rule that
   * fires wins. Persists the decision (status + filter_reason) and returns
   * the outcome so the caller can log/observe. If the article no longer
   * exists (e.g. deleted between enqueue and process), returns a no-op
   * outcome rather than throwing — duplicate jobs should not fail.
   */
  async prefilter(articleId: string): Promise<PrefilterOutcome> {
    const article = await this.articles.findOne({
      where: { id: articleId },
      select: { id: true, title: true, contentRaw: true, summaryRaw: true },
    });
    if (!article) {
      this.logger.warn(`prefilter article=${articleId} no-op: not found`);
      return { status: 'filtered', reason: null };
    }

    const thresholds: PrefilterThresholds = {
      minContentLength: this.config.get('PREFILTER_MIN_CONTENT_LENGTH', { infer: true }),
      maxLinkDensity: this.config.get('PREFILTER_MAX_LINK_DENSITY', { infer: true }),
    };
    // Many RSS feeds populate <description>/summary instead of <content:encoded>.
    // rss-parser maps the former to summaryRaw and the latter to contentRaw.
    // Fall back to summaryRaw so we don't reject content-rich feeds whose
    // body happens to live in the summary field.
    const view: PrefilterArticleView = {
      title: article.title,
      contentRaw: article.contentRaw ?? article.summaryRaw,
    };

    for (const rule of PREFILTER_RULES) {
      if (rule.check(view, thresholds)) {
        await this.articles.update(article.id, {
          status: 'filtered',
          filterReason: rule.name,
        });
        this.logger.log(`prefilter article=${article.id} status=filtered reason=${rule.name}`);
        return { status: 'filtered', reason: rule.name };
      }
    }

    await this.articles.update(article.id, {
      status: 'pending_llm',
      filterReason: null,
    });
    // Hand off to the LLM-processing worker. Filtered articles never reach
    // here, so we only enqueue for articles that survived all the rules.
    // Longer backoff than prefilter — LLM rate limits can be sticky.
    await this.processQueue.add(
      'process',
      { articleId: article.id },
      { attempts: 3, backoff: { type: 'exponential', delay: 60_000 } },
    );
    this.logger.log(`prefilter article=${article.id} status=pending_llm reason=none`);
    return { status: 'pending_llm', reason: null };
  }
}
