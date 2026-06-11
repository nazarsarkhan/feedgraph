import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { isWorkerMode } from '../config/run-mode';
import { LlmModule } from '../llm/llm.module';
import { Digest } from './digest.entity';
import { DigestProcessor } from './digest.processor';
import { DigestsController } from './digests.controller';
import { DigestsService } from './digests.service';

@Module({
  // AuthModule re-exports UsersModule, which the EmailConfirmedGuard on
  // the controller needs (same import pattern as every per-user feature
  // module). LlmModule wires DigestsService's LlmService dep. The DIGEST
  // queue itself comes from the @Global QueueModule.
  imports: [TypeOrmModule.forFeature([Digest]), AuthModule, LlmModule],
  controllers: [DigestsController],
  // The digest processor only loads in worker/all mode (RUN_MODE split). The
  // controller/service stay in the api process so the generate/status endpoints
  // (which only enqueue + poll job state) keep working there.
  providers: [DigestsService, ...(isWorkerMode() ? [DigestProcessor] : [])],
})
export class DigestsModule {}
