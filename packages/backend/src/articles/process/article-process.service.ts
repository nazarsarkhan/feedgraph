import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import type { ArticleAnalysis, AxisAssignment } from '@feedgraph/shared';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Article } from '../../articles/article.entity';
import { AxesService } from '../../axes/axes.service';
import { CategoriesService } from '../../categories/categories.service';
import { GraphEntitiesService } from '../../graph-entities/graph-entities.service';
import { LlmService } from '../../llm/llm.service';

// Multi-tenant note: the worker is system-wide (no userId param). The
// article row carries user_id, and every relationship insert downstream is
// scoped via that user — the article's userId is the single source of
// truth for which user this work belongs to. Enqueue happens from the
// prefilter, which already trusts the article's userId.

interface ProcessOutcome {
  status: 'processed' | 'filtered' | 'noop';
  entities: number;
  categories: number;
  axisValues: number;
  importance: 'high' | 'normal' | null;
  reason: string | null;
}

@Injectable()
export class ArticleProcessService {
  private readonly logger = new Logger(ArticleProcessService.name);

  constructor(
    @InjectRepository(Article) private readonly articles: Repository<Article>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly llm: LlmService,
    private readonly graphEntities: GraphEntitiesService,
    private readonly categories: CategoriesService,
    private readonly axes: AxesService,
  ) {}

  async process(articleId: string): Promise<ProcessOutcome> {
    const article = await this.articles.findOne({ where: { id: articleId } });
    if (!article) {
      this.logger.warn(`article-process article=${articleId} no-op: not found`);
      return this.empty('noop', null);
    }
    if (article.status !== 'pending_llm') {
      // Idempotent replay guard. A retried job (or a manual re-enqueue) must
      // not overwrite an already-processed article and its relationships.
      this.logger.log(
        `article-process article=${articleId} no-op: status=${article.status} (not pending_llm)`,
      );
      return this.empty('noop', null);
    }

    // Live config — honor whatever the user's categories/axes look like at
    // this moment, not at enqueue time.
    const [userCategories, userAxes] = await Promise.all([
      this.categories.findAllForUser(article.userId),
      this.axes.findAllForUser(article.userId),
    ]);

    const content = article.contentRaw ?? article.summaryRaw ?? '';

    const analysis = await this.llm.analyzeArticle({
      contentHash: article.contentHash,
      content,
      title: article.title ?? '',
      userCategories: userCategories.map((c) => c.name),
      userAxes: userAxes.map((ax) => ({
        name: ax.name,
        values: ax.values.map((v) => v.value),
      })),
      userId: article.userId,
    });

    return this.persist(article, analysis, userCategories, userAxes);
  }

  private async persist(
    article: Article,
    analysis: ArticleAnalysis,
    userCategories: Array<{ id: string; name: string }>,
    userAxes: Array<{ id: string; name: string; values: Array<{ id: string; value: string }> }>,
  ): Promise<ProcessOutcome> {
    const articleId = article.id;
    const userId = article.userId;
    const isJunk = analysis.importance === 'junk';
    const finalStatus = isJunk ? 'filtered' : 'processed';
    const finalImportance: 'high' | 'normal' | null =
      analysis.importance === 'high' || analysis.importance === 'normal'
        ? analysis.importance
        : null;
    const filterReason = isJunk ? 'llm_junk' : null;

    // Pre-resolve category and axis-value matches outside the transaction
    // so the tx body is pure DB writes. Misses are dropped silently per ADR.
    const categoryIds = this.resolveCategoryIds(analysis.categoryHints, userCategories, articleId);
    const axisValueIds = this.resolveAxisValueIds(analysis.axisAssignments, userAxes, articleId);

    let entityCount = 0;
    await this.dataSource.transaction(async (manager: EntityManager) => {
      const occurredAt = article.publishedAt ?? new Date();
      const entityIds: string[] = [];
      for (const ent of analysis.entities) {
        const id = await this.graphEntities.findOrCreate(
          {
            userId,
            name: ent.name,
            type: ent.type,
            occurredAt,
          },
          manager,
        );
        entityIds.push(id);
      }
      entityCount = entityIds.length;
      await this.graphEntities.linkToArticle(articleId, entityIds, manager);

      if (categoryIds.length > 0) {
        await manager
          .createQueryBuilder()
          .insert()
          .into('article_categories')
          .values(categoryIds.map((cid) => ({ article_id: articleId, category_id: cid })))
          .orIgnore()
          .execute();
      }
      if (axisValueIds.length > 0) {
        await manager
          .createQueryBuilder()
          .insert()
          .into('article_axis_values')
          .values(axisValueIds.map((vid) => ({ article_id: articleId, axis_value_id: vid })))
          .orIgnore()
          .execute();
      }

      await manager.update(Article, articleId, {
        status: finalStatus,
        filterReason,
        summary: analysis.summary,
        importance: finalImportance,
      });
    });

    this.logger.log(
      `article-process article=${articleId} user=${userId} status=${finalStatus} entities=${entityCount} categories=${categoryIds.length} axes=${axisValueIds.length}`,
    );

    return {
      status: finalStatus,
      entities: entityCount,
      categories: categoryIds.length,
      axisValues: axisValueIds.length,
      importance: finalImportance,
      reason: filterReason,
    };
  }

  private resolveCategoryIds(
    hints: readonly string[],
    userCategories: ReadonlyArray<{ id: string; name: string }>,
    articleId: string,
  ): string[] {
    const byName = new Map(userCategories.map((c) => [c.name, c.id]));
    const ids: string[] = [];
    for (const hint of hints) {
      const id = byName.get(hint);
      if (id) ids.push(id);
      else this.logger.debug(`article-process article=${articleId} dropped categoryHint=${hint}`);
    }
    return ids;
  }

  private resolveAxisValueIds(
    assignments: readonly AxisAssignment[],
    userAxes: ReadonlyArray<{
      id: string;
      name: string;
      values: ReadonlyArray<{ id: string; value: string }>;
    }>,
    articleId: string,
  ): string[] {
    const axesByName = new Map(userAxes.map((ax) => [ax.name, ax]));
    const ids: string[] = [];
    for (const a of assignments) {
      if (a.value === null) continue;
      const axis = axesByName.get(a.axis);
      if (!axis) {
        this.logger.debug(`article-process article=${articleId} dropped axis=${a.axis} (unknown)`);
        continue;
      }
      const matched = axis.values.find((v) => v.value === a.value);
      if (!matched) {
        this.logger.debug(
          `article-process article=${articleId} dropped axis=${a.axis} value=${a.value} (unknown value)`,
        );
        continue;
      }
      ids.push(matched.id);
    }
    return ids;
  }

  private empty(status: 'processed' | 'filtered' | 'noop', reason: string | null): ProcessOutcome {
    return {
      status,
      entities: 0,
      categories: 0,
      axisValues: 0,
      importance: null,
      reason,
    };
  }
}
