// TODO: remove before submission — temporary endpoints to exercise the
// LLM pipeline end-to-end during development. Tracked in PLAN.md tech debt.
import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { IsUUID } from 'class-validator';
import type { ArticleAnalysis } from '@feedgraph/shared';
import { DataSource, Repository } from 'typeorm';
import { Article } from '../articles/article.entity';
import { CurrentUser } from '../auth/current-user.decorator';
import { EmailConfirmedGuard } from '../auth/email-confirmed.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/types';
import { AxesService } from '../axes/axes.service';
import { CategoriesService } from '../categories/categories.service';
import { LlmService } from './llm.service';

class AnalyzeTestDto {
  @IsUUID()
  articleId!: string;
}

interface DebugEntityRow {
  id: string;
  canonical_name: string;
  type: string;
}
interface DebugCategoryRow {
  id: string;
  name: string;
}
interface DebugAxisRow {
  axis: string;
  value: string;
  value_id: string;
}

@Controller('debug')
@UseGuards(JwtAuthGuard, EmailConfirmedGuard)
export class DebugLlmController {
  constructor(
    @InjectRepository(Article) private readonly articles: Repository<Article>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly categories: CategoriesService,
    private readonly axes: AxesService,
    private readonly llm: LlmService,
  ) {}

  @Post('llm/analyze-test')
  async analyzeTest(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AnalyzeTestDto,
  ): Promise<{ articleId: string; analysis: ArticleAnalysis }> {
    // 404 on cross-tenant access, never 403.
    const article = await this.articles.findOne({
      where: { id: dto.articleId, userId: user.id },
    });
    if (!article) {
      throw new NotFoundException('Article not found');
    }

    const [userCategories, userAxes] = await Promise.all([
      this.categories.findAllForUser(user.id),
      this.axes.findAllForUser(user.id),
    ]);

    const analysis = await this.llm.analyzeArticle({
      contentHash: article.contentHash,
      title: article.title ?? '',
      content: article.contentRaw ?? article.summaryRaw ?? '',
      userCategories: userCategories.map((c) => c.name),
      userAxes: userAxes.map((ax) => ({
        name: ax.name,
        values: ax.values.map((v) => v.value),
      })),
      userId: user.id,
    });

    return { articleId: article.id, analysis };
  }

  @Get('articles/:id')
  async showArticle(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const article = await this.articles.findOne({ where: { id, userId: user.id } });
    if (!article) {
      throw new NotFoundException('Article not found');
    }

    const entities = await this.dataSource
      .createQueryBuilder()
      .select('e.id', 'id')
      .addSelect('e.canonical_name', 'canonical_name')
      .addSelect('e.type', 'type')
      .from('article_entities', 'ae')
      .innerJoin('entities', 'e', 'e.id = ae.entity_id')
      .where('ae.article_id = :id', { id })
      .getRawMany<DebugEntityRow>();

    const categories = await this.dataSource
      .createQueryBuilder()
      .select('c.id', 'id')
      .addSelect('c.name', 'name')
      .from('article_categories', 'ac')
      .innerJoin('categories', 'c', 'c.id = ac.category_id')
      .where('ac.article_id = :id', { id })
      .getRawMany<DebugCategoryRow>();

    const axisValues = await this.dataSource
      .createQueryBuilder()
      .select('a.name', 'axis')
      .addSelect('av.value', 'value')
      .addSelect('av.id', 'value_id')
      .from('article_axis_values', 'aav')
      .innerJoin('axis_values', 'av', 'av.id = aav.axis_value_id')
      .innerJoin('axes', 'a', 'a.id = av.axis_id')
      .where('aav.article_id = :id', { id })
      .getRawMany<DebugAxisRow>();

    return {
      id: article.id,
      title: article.title,
      url: article.url,
      status: article.status,
      filterReason: article.filterReason,
      importance: article.importance,
      summary: article.summary,
      entities,
      categories,
      axisAssignments: axisValues,
    };
  }
}
