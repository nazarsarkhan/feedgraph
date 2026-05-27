import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import type { GraphEntityType } from '../graph-entity.entity';

export type EntityListSortBy = 'lastSeen' | 'mentionCount' | 'name';
export type EntityListOrder = 'asc' | 'desc';

export class ListEntitiesQueryDto {
  @IsOptional()
  @IsIn(['person', 'company', 'product', 'technology', 'location'])
  type?: GraphEntityType;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  minMentions?: number;

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
  @IsIn(['lastSeen', 'mentionCount', 'name'])
  sortBy?: EntityListSortBy;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: EntityListOrder;
}
