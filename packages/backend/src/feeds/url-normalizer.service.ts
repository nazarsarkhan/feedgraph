import { Injectable } from '@nestjs/common';

// Common trackers stripped during normalization. Conservative list — we
// don't try to strip every analytics param, just the universally noisy ones.
const TRACKING_PARAM = /^utm_|^fbclid$|^gclid$|^ref$|^source$/i;

@Injectable()
export class UrlNormalizerService {
  /**
   * Returns a canonical form of the URL used as the dedup key. Pure: no I/O,
   * no state. Throws on input that URL() can't parse — caller decides what
   * to do (skip the article, log, etc).
   */
  normalize(input: string): string {
    const url = new URL(input);
    url.hostname = url.hostname.toLowerCase();
    url.hash = '';

    // Drop trackers, then re-add the rest in alphabetical order so semantically
    // equivalent URLs with different param ordering collapse to the same key.
    const keep = [...url.searchParams.entries()]
      .filter(([key]) => !TRACKING_PARAM.test(key))
      .sort(([a], [b]) => a.localeCompare(b));
    url.search = '';
    for (const [k, v] of keep) url.searchParams.append(k, v);

    if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
      url.pathname = url.pathname.slice(0, -1);
    }
    return url.toString();
  }
}
