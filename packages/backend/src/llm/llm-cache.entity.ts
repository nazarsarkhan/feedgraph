import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('llm_cache')
@Index(['contentHash', 'operation', 'model'], { unique: true })
export class LlmCache {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'content_hash', type: 'varchar', length: 64 })
  contentHash!: string;

  @Column({ type: 'varchar', length: 50 })
  operation!: string;

  @Column({ type: 'varchar', length: 100 })
  model!: string;

  @Column({ name: 'result_json', type: 'jsonb' })
  resultJson!: unknown;

  // NULL = never expires (content-hash determinism makes a hit valid forever).
  // Set to now() + LLM_CACHE_TTL_DAYS on write when the TTL is positive; the
  // daily purge job deletes rows past this, and reads filter them out.
  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
