import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { EntitiesController } from './entities.controller';
import { EntitiesListService } from './entities-list.service';
import { GraphEntitiesService } from './graph-entities.service';
import { GraphEntity } from './graph-entity.entity';

@Module({
  imports: [TypeOrmModule.forFeature([GraphEntity]), AuthModule, UsersModule],
  controllers: [EntitiesController],
  providers: [GraphEntitiesService, EntitiesListService],
  exports: [GraphEntitiesService],
})
export class GraphEntitiesModule {}
