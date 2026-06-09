import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { EmailConfirmedGuard } from '../auth/email-confirmed.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/types';
import { TelemetryQueryDto } from './dto/telemetry-query.dto';
import { TelemetryRecentRow, TelemetrySummary, TelemetryService } from './telemetry.service';

@Controller('telemetry')
@UseGuards(JwtAuthGuard, EmailConfirmedGuard)
export class TelemetryController {
  constructor(private readonly telemetry: TelemetryService) {}

  @Get('summary')
  getSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: TelemetryQueryDto,
  ): Promise<TelemetrySummary> {
    return this.telemetry.getSummary(user.id, query);
  }

  // Cross-user, system-wide summary. The extra method-level AdminGuard runs
  // after the controller's JwtAuthGuard + EmailConfirmedGuard; a non-admin is
  // rejected with 403. Static segment 'admin/summary' can't collide with the
  // single-segment routes above.
  @Get('admin/summary')
  @UseGuards(AdminGuard)
  getAdminSummary(@Query() query: TelemetryQueryDto): Promise<TelemetrySummary> {
    return this.telemetry.getAdminSummary(query);
  }

  @Get('recent')
  getRecent(@CurrentUser() user: AuthenticatedUser): Promise<TelemetryRecentRow[]> {
    return this.telemetry.getRecent(user.id);
  }
}
