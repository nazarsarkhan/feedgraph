import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { GraphEntity, type GraphEntityType } from './graph-entity.entity';

// Multi-tenant contract: findOrCreate filters by userId; the unique
// (user_id, lower(canonical_name), type) index guarantees no entity row
// crosses user boundaries. Cross-tenant entity ids are impossible at the
// schema level. The linkToArticle method does not re-check tenancy — its
// caller (ArticleProcessService) has already loaded the article by id
// without a userId filter (worker context) but the article row carries
// the userId that produced the entity ids in the first place.

export interface FindOrCreateInput {
  userId: string;
  name: string;
  type: GraphEntityType;
  occurredAt: Date;
}

@Injectable()
export class GraphEntitiesService {
  constructor(
    @InjectRepository(GraphEntity)
    private readonly entities: Repository<GraphEntity>,
  ) {}

  /**
   * Deterministic dedup by (userId, lower(canonical_name), type). On hit:
   * stretches last_seen forward if occurredAt is later, returns the row.
   * On miss: inserts with first_seen = last_seen = occurredAt, aliases [].
   * Honors a passed EntityManager so callers can include this in their own
   * transaction (ArticleProcessService wraps the whole persist step).
   */
  async findOrCreate(input: FindOrCreateInput, manager?: EntityManager): Promise<string> {
    const repo = manager ? manager.getRepository(GraphEntity) : this.entities;

    // Lookup uses the same lower(canonical_name) expression as the unique
    // index, so the index is actually used for the read.
    const existing = await repo
      .createQueryBuilder('e')
      .select('e.id', 'id')
      .addSelect('e.last_seen', 'last_seen')
      .where('e.user_id = :userId', { userId: input.userId })
      .andWhere('lower(e.canonical_name) = lower(:name)', { name: input.name })
      .andWhere('e.type = :type', { type: input.type })
      .getRawOne<{ id: string; last_seen: Date }>();

    if (existing) {
      // GREATEST handles the case where multiple workers race on the same
      // entity — whichever lands second can only push last_seen forward.
      await repo
        .createQueryBuilder()
        .update(GraphEntity)
        .set({ lastSeen: () => `GREATEST(last_seen, :occurredAt::timestamptz)` })
        .where('id = :id', { id: existing.id })
        .setParameter('occurredAt', input.occurredAt.toISOString())
        .execute();
      return existing.id;
    }

    // Insert; orIgnore in case a sibling worker races us on the same
    // unique key. If a race happened we re-read and return the winner.
    const result = await repo
      .createQueryBuilder()
      .insert()
      .into(GraphEntity)
      .values({
        userId: input.userId,
        canonicalName: input.name,
        type: input.type,
        aliases: [],
        firstSeen: input.occurredAt,
        lastSeen: input.occurredAt,
      })
      .orIgnore()
      .returning('id')
      .execute();

    const inserted = (result.raw as Array<{ id: string }>) ?? [];
    if (inserted.length > 0) {
      return inserted[0].id;
    }

    // orIgnore swallowed a conflict — fetch whichever row won the race.
    const winner = await repo
      .createQueryBuilder('e')
      .select('e.id', 'id')
      .where('e.user_id = :userId', { userId: input.userId })
      .andWhere('lower(e.canonical_name) = lower(:name)', { name: input.name })
      .andWhere('e.type = :type', { type: input.type })
      .getRawOne<{ id: string }>();

    if (!winner) {
      throw new Error(
        `entity findOrCreate: insert was ignored but no row found user=${input.userId} name=${input.name} type=${input.type}`,
      );
    }
    return winner.id;
  }

  /**
   * Bulk link of (articleId, entityIds) into article_entities. Composite
   * primary key (article_id, entity_id) + orIgnore means a retried worker
   * doesn't double-insert. No-op on empty list.
   */
  async linkToArticle(
    articleId: string,
    entityIds: readonly string[],
    manager?: EntityManager,
  ): Promise<void> {
    if (entityIds.length === 0) return;
    // Use the EntityManager's QueryBuilder directly so the insert runs on
    // the SAME QueryRunner as findOrCreate — otherwise the link statement
    // executes outside the transaction and the not-yet-committed entity
    // rows are invisible, producing FK violations.
    const qb = manager ? manager.createQueryBuilder() : this.entities.manager.createQueryBuilder();
    await qb
      .insert()
      .into('article_entities')
      .values(entityIds.map((entityId) => ({ article_id: articleId, entity_id: entityId })))
      .orIgnore()
      .execute();
  }
}
