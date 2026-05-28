import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { LlmModule } from '../llm/llm.module';
import { UsersModule } from '../users/users.module';
import { Digest } from './digest.entity';
import { DigestsController } from './digests.controller';
import { DigestsService } from './digests.service';

@Module({
  // AuthModule + UsersModule are needed for the EmailConfirmedGuard on
  // the controller (same import pattern as every per-user feature
  // module). LlmModule wires DigestsService's LlmService dep.
  imports: [TypeOrmModule.forFeature([Digest]), AuthModule, UsersModule, LlmModule],
  controllers: [DigestsController],
  providers: [DigestsService],
})
export class DigestsModule {}
