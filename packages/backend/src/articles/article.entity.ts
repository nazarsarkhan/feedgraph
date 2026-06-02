import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Feed } from '../feeds/feed.entity';
import { User } from '../users/user.entity';

export type ArticleStatus = 'raw' | 'filtered' | 'pending_llm' | 'processed' | 'error';
export type ArticleImportance = 'high' | 'normal';
// Closed set of filter reasons: the four deterministic PREFILTER_RULES names
// plus the LLM-junk verdict. Backed by the articles_filter_reason_enum
// Postgres type (migration 1717800000000).
export type FilterReason =
  | 'missing_title'
  | 'content_too_short'
  | 'clickbait_title'
  | 'high_link_density'
  | 'llm_junk';

@Entity('articles')
@Index(['userId'])
@Index(['feedId'])
@Index(['userId', 'urlNormalized'], { unique: true })
@Index(['userId', 'contentHash'])
@Index(['publishedAt'])
export class Article {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'feed_id', type: 'uuid', nullable: true })
  feedId!: string | null;

  @ManyToOne(() => Feed, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'feed_id' })
  feed!: Feed | null;

  @Column({ type: 'varchar', length: 2048 })
  url!: string;

  @Column({ name: 'url_normalized', type: 'varchar', length: 2048 })
  urlNormalized!: string;

  @Column({ name: 'content_hash', type: 'varchar', length: 64 })
  contentHash!: string;

  @Column({ type: 'varchar', length: 512, nullable: true })
  guid!: string | null;

  @Column({ type: 'text', nullable: true })
  title!: string | null;

  @Column({ name: 'summary_raw', type: 'text', nullable: true })
  summaryRaw!: string | null;

  @Column({ name: 'content_raw', type: 'text', nullable: true })
  contentRaw!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  author!: string | null;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt!: Date | null;

  @Column({
    type: 'enum',
    enum: ['raw', 'filtered', 'pending_llm', 'processed', 'error'],
    default: 'raw',
  })
  status!: ArticleStatus;

  @Column({
    name: 'filter_reason',
    type: 'enum',
    enum: [
      'missing_title',
      'content_too_short',
      'clickbait_title',
      'high_link_density',
      'llm_junk',
    ],
    nullable: true,
  })
  filterReason!: FilterReason | null;

  // LLM-derived summary. Distinct from summaryRaw, which is whatever the
  // RSS feed shipped. Null until the article reaches status='processed'.
  @Column({ type: 'text', nullable: true })
  summary!: string | null;

  // 'high' or 'normal' once processed; null while pending or when the LLM
  // marked the article junk (the article then lives at status='filtered').
  @Column({
    type: 'enum',
    enum: ['high', 'normal'],
    nullable: true,
  })
  importance!: ArticleImportance | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
