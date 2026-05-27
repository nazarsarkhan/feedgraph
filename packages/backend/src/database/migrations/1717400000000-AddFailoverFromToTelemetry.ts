import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFailoverFromToTelemetry1717400000000 implements MigrationInterface {
  name = 'AddFailoverFromToTelemetry1717400000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // failover_from is NULL for normal calls and for the failed-primary row
    // of a failover scenario. It carries the primary's provider name on the
    // SECONDARY row that succeeded after failover, so dashboards can show
    // "X% of successful calls came via failover, from which provider".
    await queryRunner.query(`ALTER TABLE "llm_telemetry" ADD COLUMN "failover_from" varchar(50)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "llm_telemetry" DROP COLUMN IF EXISTS "failover_from"`);
  }
}
