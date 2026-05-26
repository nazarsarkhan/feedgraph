import * as path from 'path';
import { config as loadDotenv } from 'dotenv';
import { DataSource } from 'typeorm';
import { User } from '../users/user.entity';

// Used by the TypeORM CLI (migration:generate / run / revert) which boots
// outside Nest and therefore needs its own way to read env vars.
loadDotenv({ path: path.resolve(__dirname, '../../../../.env') });

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.POSTGRES_HOST ?? 'localhost',
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  username: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,
  entities: [User],
  migrations: [path.join(__dirname, 'migrations/*.{ts,js}')],
  synchronize: false,
});
