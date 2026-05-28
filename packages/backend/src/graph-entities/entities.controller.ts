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
import { ListEntitiesQueryDto } from './dto/list-entities-query.dto';
import {
  EntitiesListService,
  EntityDetail,
  EntityListItem,
  PaginationMeta,
} from './entities-list.service';
import { EntityDedupService } from './entity-dedup.service';

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

  // Sits before `:id` because route order matters in Nest's pattern
  // matcher and "deduplicate" would otherwise match the @Get(':id')
  // route as a UUID param and 400 on ParseUUIDPipe.
  @Post('deduplicate')
  @HttpCode(200)
  deduplicate(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ entitiesConsidered: number; groupsFound: number; entitiesMerged: number }> {
    return this.dedup.deduplicateForUser(user.id);
  }

  @Get(':id')
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<EntityDetail> {
    return this.entities.detail(user.id, id);
  }
}
