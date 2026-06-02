import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { LlmModule } from '../llm/llm.module';
import { CoMentionViewService } from './co-mention-view.service';
import { EntitiesController } from './entities.controller';
import { EntitiesListService } from './entities-list.service';
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
  providers: [
    GraphEntitiesService,
    EntitiesListService,
    GraphService,
    EntityDedupService,
    CoMentionViewService,
  ],
  exports: [GraphEntitiesService, CoMentionViewService],
})
export class GraphEntitiesModule {}
