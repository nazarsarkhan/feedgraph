import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { EmailConfirmedGuard } from '../auth/email-confirmed.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/types';
import { PaginationQueryDto } from '../articles/dto/pagination-query.dto';
import { ListEntitiesQueryDto } from './dto/list-entities-query.dto';
import {
  EntitiesListService,
  EntityDetail,
  EntityListItem,
  PaginationMeta,
} from './entities-list.service';
import { EntityDedupService, type DedupJobStatus } from './entity-dedup.service';

@Controller('entities')
@UseGuards(JwtAuthGuard, EmailConfirmedGuard)
export class EntitiesController {
  constructor(
    private readonly entities: EntitiesListService,
    private readonly dedup: EntityDedupService,
  ) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() filters: ListEntitiesQueryDto,
  ): Promise<{ items: EntityListItem[]; pagination: PaginationMeta }> {
    return this.entities.list(user.id, filters);
  }

  // Enqueues an async dedup job and returns 202 + the job id. The actual
  // matchEntities work runs on the ENTITY_DEDUP worker (see ADR) — the HTTP
  // layer never blocks on an LLM round-trip. Poll GET deduplicate/:jobId.
  @Post('deduplicate')
  @HttpCode(202)
  deduplicate(@CurrentUser() user: AuthenticatedUser): Promise<{ jobId: string }> {
    return this.dedup.enqueueForUser(user.id);
  }

  // Status of a dedup job for polling. Two path segments, so it doesn't
  // collide with the single-segment `:id` route. Cross-tenant / unknown
  // jobs both 404 (the project-wide don't-acknowledge-existence convention).
  @Get('deduplicate/:jobId')
  deduplicateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('jobId') jobId: string,
  ): Promise<DedupJobStatus> {
    return this.dedup.getJobStatus(user.id, jobId);
  }

  // Paginated "all articles mentioning this entity" — two path segments, so
  // it doesn't collide with the single-segment `:id` route.
  @Get(':id/articles')
  articles(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() pagination: PaginationQueryDto,
  ): Promise<{
    items: {
      id: string;
      title: string | null;
      feedName: string | null;
      publishedAt: string | null;
    }[];
    pagination: PaginationMeta;
  }> {
    return this.entities.articlesForEntity(user.id, id, pagination.page, pagination.pageSize);
  }

  @Get(':id')
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<EntityDetail> {
    return this.entities.detail(user.id, id);
  }
}
