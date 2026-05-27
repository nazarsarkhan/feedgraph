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

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
