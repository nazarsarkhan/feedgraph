import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GraphEntitiesService } from './graph-entities.service';
import { GraphEntity } from './graph-entity.entity';

@Module({
  imports: [TypeOrmModule.forFeature([GraphEntity])],
  providers: [GraphEntitiesService],
  exports: [GraphEntitiesService],
})
export class GraphEntitiesModule {}
