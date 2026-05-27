import { Type } from 'class-transformer';
import { IsIn, IsISO8601, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export type ArticleListSortBy = 'publishedAt' | 'createdAt';
export type ArticleListOrder = 'asc' | 'desc';

export class ListArticlesQueryDto {
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
