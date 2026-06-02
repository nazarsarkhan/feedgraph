import { IsISO8601, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/**
 * Optional filters for POST /articles/regenerate. When omitted, regenerate
 * resets ALL processed articles (plus re-enqueues stuck pending_llm rows).
 * When any filter is present, only matching processed articles are reset —
 * the "Regenerate filtered" action on the articles page. Mirrors the
 * ListArticlesQueryDto filter fields (no pagination/sort/status — status is
 * forced to 'processed').
 */
export class RegenerateArticlesDto {
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
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;
}
