import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { AxisValue } from './axis-value.entity';

@Entity('axes')
@Index(['userId'])
@Index(['userId', 'name'], { unique: true })
export class Axis {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  // eager: true — reading an axis without its values is never useful.
  // cascade: true — saving an axis persists its values too, used by seeding.
  @OneToMany(() => AxisValue, (v) => v.axis, { cascade: true, eager: true })
  values!: AxisValue[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
