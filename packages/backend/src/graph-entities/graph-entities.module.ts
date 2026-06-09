import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { isWorkerMode } from '../config/run-mode';
import { LlmModule } from '../llm/llm.module';
import { CoMentionViewService } from './co-mention-view.service';
import { EntitiesController } from './entities.controller';
import { EntitiesListService } from './entities-list.service';
import { EntityDedupProcessor } from './entity-dedup.processor';
import { EntityDedupService } from './entity-dedup.service';
import { GraphEntitiesService } from './graph-entities.service';
import { GraphEntity } from './graph-entity.entity';
import { GraphController } from './graph.controller';
import { GraphService } from './graph.service';

@Module({
  // LlmModule wires EntityDedupService's LlmService dependency. AuthModule
  // (which re-exports UsersModule) is needed for the EmailConfirmedGuard on
  // the controller — same import pattern every per-user feature module uses.
  imports: [TypeOrmModule.forFeature([GraphEntity]), AuthModule, LlmModule],
  controllers: [EntitiesController, GraphController],
  // The dedup processor only loads in worker/all mode (RUN_MODE split). The
  // controller/services stay in the api process so the dedup endpoints (which
  // only enqueue + poll job state) keep working there.
  providers: [
    GraphEntitiesService,
    EntitiesListService,
    GraphService,
    EntityDedupService,
    CoMentionViewService,
    ...(isWorkerMode() ? [EntityDedupProcessor] : []),
  ],
  exports: [GraphEntitiesService, CoMentionViewService],
})
export class GraphEntitiesModule {}
