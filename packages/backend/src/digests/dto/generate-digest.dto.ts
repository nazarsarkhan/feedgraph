import { IsDateString, IsIn } from 'class-validator';
import type { DigestPeriodType } from '../digest.entity';

export class GenerateDigestDto {
  @IsIn(['day', 'week', 'month'])
  periodType!: DigestPeriodType;

  // Any calendar date within the desired period. DigestsService computes
  // the canonical (periodStart, periodEnd) bounds from this + periodType,
  // so the caller doesn't need to know what a "week" or "month" starts on.
  @IsDateString()
  date!: string;
}
