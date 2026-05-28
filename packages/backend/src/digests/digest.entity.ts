import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

export type DigestPeriodType = 'day' | 'week' | 'month';
export type DigestSentiment = 'positive' | 'negative' | 'neutral' | 'mixed';

/**
 * LLM-generated digest for a calendar period. Created on-demand via
 * POST /digests/generate; idempotent on (user_id, period_type,
 * period_start) — the DB unique constraint backstops the service-level
 * check. See ADR in PLAN.md.
 *
 * period_start / period_end are DATE columns (no time of day); pg's node
 * driver returns them as YYYY-MM-DD strings, so the entity types are
 * `string` rather than `Date` to keep the boundary explicit.
 */
@Entity('digests')
@Index(['userId', 'periodType', 'periodStart'], { unique: true })
export class Digest {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'period_type', type: 'varchar', length: 10 })
  periodType!: DigestPeriodType;

  @Column({ name: 'period_start', type: 'date' })
  periodStart!: string;

  @Column({ name: 'period_end', type: 'date' })
  periodEnd!: string;

  @Column({ type: 'text' })
  summary!: string;

  @Column({ name: 'key_themes', type: 'jsonb', default: () => "'[]'" })
  keyThemes!: string[];

  @Column({ name: 'top_entities', type: 'jsonb', default: () => "'[]'" })
  topEntities!: string[];

  @Column({ name: 'article_count', type: 'integer', default: 0 })
  articleCount!: number;

  @Column({ type: 'varchar', length: 20, nullable: true })
  sentiment!: DigestSentiment | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
