import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

// Two-role model: 'user' is the default for every registrant; 'admin' is
// granted out-of-band (the demo seed plants one) and unlocks cross-user views
// like system-wide LLM telemetry. Backed by the users_role_enum Postgres type
// (migration 1718200000000).
export type UserRole = 'user' | 'admin';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  email!: string;

  @Column({ name: 'password_hash' })
  passwordHash!: string;

  @Column({ type: 'enum', enum: ['user', 'admin'], default: 'user' })
  role!: UserRole;

  @Column({ name: 'email_confirmed_at', type: 'timestamptz', nullable: true })
  emailConfirmedAt!: Date | null;

  @Column({ name: 'email_confirmation_token', type: 'varchar', length: 128, nullable: true })
  emailConfirmationToken!: string | null;

  @Column({ name: 'email_confirmation_expires_at', type: 'timestamptz', nullable: true })
  emailConfirmationExpiresAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
