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
import { Axis } from './axis.entity';

@Entity('axis_values')
@Index(['axisId'])
@Index(['axisId', 'value'], { unique: true })
export class AxisValue {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'axis_id', type: 'uuid' })
  axisId!: string;

  @ManyToOne(() => Axis, (a) => a.values, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'axis_id' })
  axis!: Axis;

  @Column({ type: 'varchar', length: 100 })
  value!: string;

  @Column({ type: 'int' })
  position!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
