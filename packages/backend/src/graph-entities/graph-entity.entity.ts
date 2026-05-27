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
import { User } from '../users/user.entity';

export type GraphEntityType = 'person' | 'company' | 'product' | 'technology' | 'location';

// Named GraphEntity (not Entity) because the symbol `Entity` is already the
// TypeORM decorator imported above — collisions would be inevitable. The
// table name is 'entities' so the rest of the schema reads naturally.
@Entity('entities')
@Index(['userId'])
export class GraphEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'canonical_name', type: 'varchar', length: 200 })
  canonicalName!: string;

  @Column({
    type: 'enum',
    enum: ['person', 'company', 'product', 'technology', 'location'],
  })
  type!: GraphEntityType;

  // Future home for fuzzy-match merges — matchEntities (next-step LLM op)
  // will write surface-form variants into this array so downstream queries
  // can search by any spelling.
  @Column({ type: 'jsonb', default: () => "'[]'" })
  aliases!: string[];

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'first_seen', type: 'timestamptz' })
  firstSeen!: Date;

  @Column({ name: 'last_seen', type: 'timestamptz' })
  lastSeen!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
