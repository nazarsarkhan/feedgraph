import { Type } from 'class-transformer';
import {
  IsIn,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export type ArticleListSortBy = 'publishedAt' | 'createdAt';
export type ArticleListOrder = 'asc' | 'desc';

export class ListArticlesQueryDto {
  // Free-text search query. Goes through Postgres
  // `websearch_to_tsquery('english', q)` against `articles.search_vector`
  // — see the AddArticlesFts migration. Capped at 200 chars so a
  // pathological query string can't blow up the tsquery parser.
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @IsUUID()
  category?: string;

  @IsOptional()
  @IsUUID()
  feedId?: string;

  @IsOptional()
  @IsIn(['high', 'normal'])
  importance?: 'high' | 'normal';

  @IsOptional()
  @IsIn(['raw', 'filtered', 'pending_llm', 'processed', 'error'])
  status?: 'raw' | 'filtered' | 'pending_llm' | 'processed' | 'error';

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @IsOptional()
  @IsIn(['publishedAt', 'createdAt'])
  sortBy?: ArticleListSortBy;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: ArticleListOrder;
}
