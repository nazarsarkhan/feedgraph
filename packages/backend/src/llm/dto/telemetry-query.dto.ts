import { IsISO8601, IsOptional } from 'class-validator';

/**
 * Optional date-range for the telemetry summary. Both bounds are ISO 8601
 * timestamps (UTC). When omitted, the service defaults to the last 14 days.
 */
export class TelemetryQueryDto {
  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;
}
