// TODO: remove before submission — temporary endpoint to exercise the LLM
// pipeline end-to-end during development. Tracked in PLAN.md tech debt.
import { Body, Controller, NotFoundException, Post, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsUUID } from 'class-validator';
import type { ArticleAnalysis } from '@feedgraph/shared';
import { Repository } from 'typeorm';
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

@Controller('debug/llm')
@UseGuards(JwtAuthGuard, EmailConfirmedGuard)
export class DebugLlmController {
  constructor(
    @InjectRepository(Article) private readonly articles: Repository<Article>,
    private readonly categories: CategoriesService,
    private readonly axes: AxesService,
    private readonly llm: LlmService,
  ) {}

  @Post('analyze-test')
  async analyzeTest(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AnalyzeTestDto,
  ): Promise<{ articleId: string; analysis: ArticleAnalysis }> {
    // Tenancy: 404 on cross-tenant access, never 403 — don't acknowledge
    // existence of other users' articles.
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
}
