import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('llm_telemetry')
@Index(['createdAt'])
@Index(['provider', 'operation'])
export class LlmTelemetry {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId!: string | null;

  @Column({ type: 'varchar', length: 50 })
  provider!: string;

  @Column({ type: 'varchar', length: 100 })
  model!: string;

  @Column({ type: 'varchar', length: 50 })
  operation!: string;

  @Column({ name: 'prompt_tokens', type: 'int', default: 0 })
  promptTokens!: number;

  @Column({ name: 'completion_tokens', type: 'int', default: 0 })
  completionTokens!: number;

  @Column({ name: 'total_tokens', type: 'int', default: 0 })
  totalTokens!: number;

  @Column({ name: 'cache_hit', type: 'boolean', default: false })
  cacheHit!: boolean;

  @Column({ name: 'latency_ms', type: 'int', default: 0 })
  latencyMs!: number;

  @Column({ type: 'boolean', default: true })
  success!: boolean;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  // Provider that failed BEFORE this call, when this row represents the
  // successful failover. NULL on normal calls and on the failed-primary row
  // itself (which records its own provider via the `provider` column).
  @Column({ name: 'failover_from', type: 'varchar', length: 50, nullable: true })
  failoverFrom!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
