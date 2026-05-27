import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { createHash } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { Article } from '../../articles/article.entity';
import { AxesService } from '../../axes/axes.service';
import { Axis } from '../../axes/axis.entity';
import { Category } from '../../categories/category.entity';
import { Feed } from '../../feeds/feed.entity';
import { UrlNormalizerService } from '../../feeds/url-normalizer.service';
import { GraphEntity } from '../../graph-entities/graph-entity.entity';
import { User } from '../../users/user.entity';
import {
  DEMO_ARTICLES,
  DEMO_CATEGORIES,
  DEMO_ENTITIES,
  DEMO_FEEDS,
  DEMO_USER,
  type DemoFeed,
} from './demo-data';

/**
 * Idempotent demo-data seeder. Skips if the demo user already exists (no
 * re-seed, no destructive cleanup — too dangerous if invoked by accident in
 * an environment with real data). The whole insertion runs in one
 * DataSource.transaction so a partial failure can't leave the DB in a state
 * where a demo user exists but their articles don't.
 */
@Injectable()
export class DemoSeedService {
  private readonly logger = new Logger(DemoSeedService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly axesService: AxesService,
    private readonly urlNormalizer: UrlNormalizerService,
  ) {}

  async seed(): Promise<{ skipped: boolean; userId: string | null }> {
    const existing = await this.dataSource
      .getRepository(User)
      .findOne({ where: { email: DEMO_USER.email } });
    if (existing) {
      this.logger.log(
        `demo user already exists user=${existing.id} email=${DEMO_USER.email}, skipping seed`,
      );
      return { skipped: true, userId: existing.id };
    }

    // argon2 hashing is the same flow as AuthService.register so the demo
    // user can log in via the normal POST /auth/login endpoint.
    const passwordHash = await argon2.hash(DEMO_USER.password);

    const userId = await this.dataSource.transaction(async (manager) => {
      const user = await this.createDemoUser(manager, passwordHash);
      // AuthService.register would call this — we bypass register so we can
      // pre-confirm the email and skip the dev-mode token flow.
      await this.axesService.seedDefaultsForUser(user.id, manager);

      const categoryIds = await this.insertCategories(manager, user.id);
      const feedIds = await this.insertFeeds(manager, user.id);
      const entityIds = await this.insertEntities(manager, user.id);
      const articleIds = await this.insertArticles(manager, user.id, feedIds);
      await this.insertArticleEntities(manager, articleIds, entityIds);
      await this.insertArticleCategories(manager, articleIds, categoryIds);
      const axisAssignmentCount = await this.insertArticleAxisValues(manager, user.id, articleIds);

      this.logger.log(
        `seeded demo: user=${user.id} feeds=${feedIds.size} articles=${articleIds.size} ` +
          `entities=${entityIds.size} categories=${categoryIds.size} ` +
          `axisAssignments=${axisAssignmentCount}`,
      );
      return user.id;
    });

    return { skipped: false, userId };
  }

  private async createDemoUser(manager: EntityManager, passwordHash: string): Promise<User> {
    const userRepo = manager.getRepository(User);
    const user = userRepo.create({
      email: DEMO_USER.email,
      passwordHash,
      // Pre-confirmed so the reviewer can log in immediately without going
      // through the email confirmation flow.
      emailConfirmedAt: new Date(),
      emailConfirmationToken: null,
      emailConfirmationExpiresAt: null,
    });
    return userRepo.save(user);
  }

  private async insertCategories(
    manager: EntityManager,
    userId: string,
  ): Promise<Map<string, string>> {
    const categoryRepo = manager.getRepository(Category);
    const map = new Map<string, string>();
    for (const name of DEMO_CATEGORIES) {
      const saved = await categoryRepo.save(categoryRepo.create({ userId, name }));
      map.set(name, saved.id);
    }
    return map;
  }

  private async insertFeeds(
    manager: EntityManager,
    userId: string,
  ): Promise<Map<DemoFeed['key'], string>> {
    const feedRepo = manager.getRepository(Feed);
    const map = new Map<DemoFeed['key'], string>();
    // lastPolledAt = now - 15 min so the feed shows as recently active in
    // the UI without claiming a poll just happened.
    const lastPolledAt = new Date(Date.now() - 15 * 60 * 1000);
    for (const feed of DEMO_FEEDS) {
      const saved = await feedRepo.save(
        feedRepo.create({
          userId,
          url: feed.url,
          name: feed.name,
          status: 'active',
          lastPolledAt,
          lastErrorMessage: null,
        }),
      );
      map.set(feed.key, saved.id);
    }
    return map;
  }

  private async insertEntities(
    manager: EntityManager,
    userId: string,
  ): Promise<Map<string, string>> {
    const entityRepo = manager.getRepository(GraphEntity);
    const map = new Map<string, string>();
    // first_seen / last_seen are computed against the articles that mention
    // each entity so the timeline on the entity card looks plausible.
    const articleDateByEntity = this.computeArticleDateRangeByEntity();
    const now = Date.now();

    for (const entity of DEMO_ENTITIES) {
      const range = articleDateByEntity.get(entity.canonicalName);
      const firstSeen = range?.first ?? new Date(now);
      const lastSeen = range?.last ?? new Date(now);
      const saved = await entityRepo.save(
        entityRepo.create({
          userId,
          canonicalName: entity.canonicalName,
          type: entity.type,
          aliases: [...entity.aliases],
          description: entity.description,
          firstSeen,
          lastSeen,
        }),
      );
      map.set(entity.canonicalName, saved.id);
    }
    return map;
  }

  private async insertArticles(
    manager: EntityManager,
    userId: string,
    feedIds: Map<DemoFeed['key'], string>,
  ): Promise<Map<number, string>> {
    const articleRepo = manager.getRepository(Article);
    const map = new Map<number, string>();
    const nowMs = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    for (let i = 0; i < DEMO_ARTICLES.length; i++) {
      const fixture = DEMO_ARTICLES[i];
      const feedId = feedIds.get(fixture.feedKey);
      if (!feedId) throw new Error(`demo seed: unknown feedKey ${fixture.feedKey}`);

      const publishedAt = new Date(nowMs - fixture.publishedDaysAgo * dayMs);
      const contentHash =
        fixture.contentHashOverride ?? sha256(`${fixture.title}\n${fixture.contentRaw}`);
      const urlNormalized = this.urlNormalizer.normalize(fixture.url);

      const saved = await articleRepo.save(
        articleRepo.create({
          userId,
          feedId,
          url: fixture.url,
          urlNormalized,
          contentHash,
          guid: null,
          title: fixture.title,
          summaryRaw: fixture.summaryRaw,
          contentRaw: fixture.contentRaw,
          author: fixture.author,
          publishedAt,
          status: fixture.status,
          filterReason: fixture.filterReason,
          summary: fixture.summary,
          importance: fixture.importance,
        }),
      );
      map.set(i, saved.id);
    }
    return map;
  }

  private async insertArticleEntities(
    manager: EntityManager,
    articleIds: Map<number, string>,
    entityIds: Map<string, string>,
  ): Promise<void> {
    // The link table has a composite PK and no entity class — go through
    // raw createQueryBuilder so we can batch-insert pairs.
    const rows: { article_id: string; entity_id: string }[] = [];
    for (let i = 0; i < DEMO_ARTICLES.length; i++) {
      const articleId = articleIds.get(i);
      if (!articleId) continue;
      for (const entityName of DEMO_ARTICLES[i].entityMentions) {
        const entityId = entityIds.get(entityName);
        if (!entityId) {
          throw new Error(`demo seed: unknown entity mention "${entityName}" on article ${i}`);
        }
        rows.push({ article_id: articleId, entity_id: entityId });
      }
    }
    if (rows.length === 0) return;
    await manager.createQueryBuilder().insert().into('article_entities').values(rows).execute();
  }

  private async insertArticleCategories(
    manager: EntityManager,
    articleIds: Map<number, string>,
    categoryIds: Map<string, string>,
  ): Promise<void> {
    const rows: { article_id: string; category_id: string }[] = [];
    for (let i = 0; i < DEMO_ARTICLES.length; i++) {
      const articleId = articleIds.get(i);
      if (!articleId) continue;
      for (const name of DEMO_ARTICLES[i].categories) {
        const categoryId = categoryIds.get(name);
        if (!categoryId) {
          throw new Error(`demo seed: unknown category "${name}" on article ${i}`);
        }
        rows.push({ article_id: articleId, category_id: categoryId });
      }
    }
    if (rows.length === 0) return;
    await manager.createQueryBuilder().insert().into('article_categories').values(rows).execute();
  }

  private async insertArticleAxisValues(
    manager: EntityManager,
    userId: string,
    articleIds: Map<number, string>,
  ): Promise<number> {
    // Resolve axis_value IDs by (axis.name, value.value). The default axes
    // were just seeded inside this same transaction, so they're visible via
    // the EntityManager's QueryRunner. Axis.values is eager-loaded on the
    // entity, so a plain find() returns axes with values populated.
    const axes = await manager.getRepository(Axis).find({ where: { userId } });
    const lookup = new Map<string, string>();
    for (const axis of axes) {
      for (const value of axis.values ?? []) {
        lookup.set(`${axis.name}:${value.value}`, value.id);
      }
    }

    const rows: { article_id: string; axis_value_id: string }[] = [];
    for (let i = 0; i < DEMO_ARTICLES.length; i++) {
      const articleId = articleIds.get(i);
      if (!articleId) continue;
      for (const assignment of DEMO_ARTICLES[i].axisAssignments) {
        const axisValueId = lookup.get(`${assignment.axis}:${assignment.value}`);
        if (!axisValueId) {
          throw new Error(
            `demo seed: unknown axis assignment ${assignment.axis}=${assignment.value} on article ${i}`,
          );
        }
        rows.push({ article_id: articleId, axis_value_id: axisValueId });
      }
    }
    if (rows.length === 0) return 0;
    await manager.createQueryBuilder().insert().into('article_axis_values').values(rows).execute();
    return rows.length;
  }

  private computeArticleDateRangeByEntity(): Map<string, { first: Date; last: Date }> {
    const ranges = new Map<string, { first: Date; last: Date }>();
    const nowMs = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    for (const article of DEMO_ARTICLES) {
      const date = new Date(nowMs - article.publishedDaysAgo * dayMs);
      for (const entityName of article.entityMentions) {
        const existing = ranges.get(entityName);
        if (!existing) {
          ranges.set(entityName, { first: date, last: date });
        } else {
          if (date < existing.first) existing.first = date;
          if (date > existing.last) existing.last = date;
        }
      }
    }
    return ranges;
  }
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}
