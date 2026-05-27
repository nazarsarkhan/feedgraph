import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { EmailConfirmedGuard } from '../auth/email-confirmed.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/types';
import {
  ArticleDetail,
  ArticleListItem,
  ArticlesListService,
  PaginationMeta,
} from './articles-list.service';
import { ListArticlesQueryDto } from './dto/list-articles-query.dto';

@Controller('articles')
@UseGuards(JwtAuthGuard, EmailConfirmedGuard)
export class ArticlesController {
  constructor(private readonly articles: ArticlesListService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() filters: ListArticlesQueryDto,
  ): Promise<{ items: ArticleListItem[]; pagination: PaginationMeta }> {
    return this.articles.list(user.id, filters);
  }

  @Get(':id')
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ArticleDetail> {
    return this.articles.detail(user.id, id);
  }
}
