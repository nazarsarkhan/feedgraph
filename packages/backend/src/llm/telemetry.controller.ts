import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { EmailConfirmedGuard } from '../auth/email-confirmed.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/types';
import { TelemetryRecentRow, TelemetrySummary, TelemetryService } from './telemetry.service';

@Controller('telemetry')
@UseGuards(JwtAuthGuard, EmailConfirmedGuard)
export class TelemetryController {
  constructor(private readonly telemetry: TelemetryService) {}

  @Get('summary')
  getSummary(@CurrentUser() user: AuthenticatedUser): Promise<TelemetrySummary> {
    return this.telemetry.getSummary(user.id);
  }

  @Get('recent')
  getRecent(@CurrentUser() user: AuthenticatedUser): Promise<TelemetryRecentRow[]> {
    return this.telemetry.getRecent(user.id);
  }
}
