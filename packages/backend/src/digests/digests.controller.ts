import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { EmailConfirmedGuard } from '../auth/email-confirmed.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/types';
import { Digest } from './digest.entity';
import { DigestsService } from './digests.service';
import { GenerateDigestDto } from './dto/generate-digest.dto';

@Controller('digests')
@UseGuards(JwtAuthGuard, EmailConfirmedGuard)
export class DigestsController {
  constructor(private readonly digests: DigestsService) {}

  // POST returns 201 by default. The endpoint is idempotent — re-issuing
  // the same body returns the same row — but 201 is still correct for
  // the "first" call and harmless for re-calls (the response shape is
  // identical), so we don't override the default.
  @Post('generate')
  generate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GenerateDigestDto,
  ): Promise<Digest> {
    return this.digests.generate(user.id, dto.periodType, dto.date);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<Digest[]> {
    return this.digests.list(user.id);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Digest> {
    return this.digests.findOne(user.id, id);
  }
}
