import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { LlmModule } from '../llm/llm.module';
import { Digest } from './digest.entity';
import { DigestsController } from './digests.controller';
import { DigestsService } from './digests.service';

@Module({
  // AuthModule re-exports UsersModule, which the EmailConfirmedGuard on
  // the controller needs (same import pattern as every per-user feature
  // module). LlmModule wires DigestsService's LlmService dep.
  imports: [TypeOrmModule.forFeature([Digest]), AuthModule, LlmModule],
  controllers: [DigestsController],
  providers: [DigestsService],
})
export class DigestsModule {}
