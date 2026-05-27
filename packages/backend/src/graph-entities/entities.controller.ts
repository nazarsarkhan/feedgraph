import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
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

@Controller('entities')
@UseGuards(JwtAuthGuard, EmailConfirmedGuard)
export class EntitiesController {
  constructor(private readonly entities: EntitiesListService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() filters: ListEntitiesQueryDto,
  ): Promise<{ items: EntityListItem[]; pagination: PaginationMeta }> {
    return this.entities.list(user.id, filters);
  }

  @Get(':id')
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<EntityDetail> {
    return this.entities.detail(user.id, id);
  }
}
