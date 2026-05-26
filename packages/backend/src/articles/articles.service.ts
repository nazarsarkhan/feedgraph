import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Article } from './article.entity';

// Shape we accept from rss-parser. Kept minimal so a different parser could
// satisfy the contract without us depending on rss-parser's full types.
export interface RssItemInput {
  link?: string;
  guid?: string;
  title?: string;
  contentSnippet?: string;
  content?: string;
  creator?: string;
  author?: string;
  isoDate?: string;
}

export interface UpsertResult {
  inserted: boolean;
  articleId: string;
}

@Injectable()
export class ArticlesService {
  constructor(@InjectRepository(Article) private readonly articles: Repository<Article>) {}

  /**
   * Idempotent insert keyed on (user_id, url_normalized). Uses Postgres
   * ON CONFLICT DO NOTHING via TypeORM's orIgnore() so we don't rely on
   * exception-handling to detect duplicates.
   */
  async upsertFromRssItem(
    userId: string,
    feedId: string,
    item: RssItemInput,
    urlNormalized: string,
    contentHash: string,
  ): Promise<UpsertResult> {
    const url = item.link ?? '';
    const result = await this.articles
      .createQueryBuilder()
      .insert()
      .values({
        userId,
        feedId,
        url,
        urlNormalized,
        contentHash,
        guid: item.guid ?? null,
        title: item.title ?? null,
        summaryRaw: item.contentSnippet ?? null,
        contentRaw: item.content ?? null,
        author: item.creator ?? item.author ?? null,
        publishedAt: item.isoDate ? new Date(item.isoDate) : null,
        status: 'raw',
      })
      .orIgnore()
      .returning('id')
      .execute();

    // result.identifiers is pre-filled by TypeORM from client-generated UUIDs
    // regardless of whether ON CONFLICT skipped the row. result.raw reflects
    // Postgres' actual RETURNING output, which is empty when DO NOTHING fires.
    const inserted = (result.raw as Array<{ id: string }>) ?? [];
    if (inserted.length > 0) {
      return { inserted: true, articleId: inserted[0].id };
    }

    // Conflict path: the existing row's id, looked up via the same dedup key.
    const existing = await this.articles.findOne({
      where: { userId, urlNormalized },
      select: { id: true },
    });
    if (!existing) {
      // Conflict implies a row exists; if findOne returns null, schema or
      // index assumptions are wrong — surface loudly rather than guess.
      throw new Error(`upsert conflict but no row found user=${userId} url=${urlNormalized}`);
    }
    return { inserted: false, articleId: existing.id };
  }
}
