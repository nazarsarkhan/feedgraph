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
import {
  ArticleDetail,
  ArticleListItem,
  ArticlesListService,
  PaginationMeta,
} from './articles-list.service';
import { ListArticlesQueryDto } from './dto/list-articles-query.dto';
import { EmbeddingService, type EmbedResult } from './embedding.service';

@Controller('articles')
@UseGuards(JwtAuthGuard, EmailConfirmedGuard)
export class ArticlesController {
  constructor(
    private readonly articles: ArticlesListService,
    private readonly embedding: EmbeddingService,
  ) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() filters: ListArticlesQueryDto,
  ): Promise<{ items: ArticleListItem[]; pagination: PaginationMeta }> {
    return this.articles.list(user.id, filters);
  }

  // The ONLY mutation in this controller: reset processed articles to
  // pending_llm so workers re-classify them. Documented as the documented
  // exception to the "articles are read-only over HTTP" rule.
  @Post('regenerate')
  @HttpCode(200)
  regenerate(@CurrentUser() user: AuthenticatedUser): Promise<{ reset: number }> {
    return this.articles.regenerate(user.id);
  }

  // Batch-embed processed articles for semantic similarity. Idempotent
  // and capped at 200 articles per call (see EmbeddingService). Routes
  // before `:id` so this string doesn't get caught by ParseUUIDPipe.
  @Post('embed')
  @HttpCode(200)
  embed(@CurrentUser() user: AuthenticatedUser): Promise<EmbedResult> {
    return this.embedding.embedAll(user.id);
  }

  @Get(':id')
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ArticleDetail> {
    return this.articles.detail(user.id, id);
  }
}
