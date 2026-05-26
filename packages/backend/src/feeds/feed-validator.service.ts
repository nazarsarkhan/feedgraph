import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Parser from 'rss-parser';
import type { Env } from '../config/env.schema';

export type FeedValidationResult =
  | { ok: true; title: string | null }
  | { ok: false; reason: string };

@Injectable()
export class FeedValidatorService {
  private readonly logger = new Logger(FeedValidatorService.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  async validate(url: string): Promise<FeedValidationResult> {
    const timeout = this.config.get('FEED_VALIDATION_TIMEOUT_MS', { infer: true });
    const parser = new Parser({ timeout });
    try {
      const feed = await parser.parseURL(url);
      return { ok: true, title: feed.title?.trim() || null };
    } catch (err) {
      const reason = describeParseError(err);
      this.logger.warn(`feed validation failed for ${url}: ${reason}`);
      return { ok: false, reason };
    }
  }
}

// rss-parser surfaces several error shapes (network timeout, non-2xx HTTP,
// XML parse failure). Map them to short user-readable strings — full stack
// goes to logs, not back to the client.
function describeParseError(err: unknown): string {
  if (!(err instanceof Error)) return 'Unknown parser error';
  const msg = err.message;
  if (/timeout/i.test(msg)) return 'Feed did not respond in time';
  if (/Status code/i.test(msg)) return `Upstream returned an error (${msg})`;
  if (/Non-whitespace before first tag|Invalid character|unclosed/i.test(msg)) {
    return 'Response was not valid RSS/Atom XML';
  }
  return msg;
}
