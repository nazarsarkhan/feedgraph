import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import { EmailConfirmedGuard } from '../auth/email-confirmed.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/types';
import { Digest } from './digest.entity';
import { DigestsService, type DigestGenerateResult, type DigestJobStatus } from './digests.service';
import { GenerateDigestDto } from './dto/generate-digest.dto';

@Controller('digests')
@UseGuards(JwtAuthGuard, EmailConfirmedGuard)
export class DigestsController {
  constructor(private readonly digests: DigestsService) {}

  // Either short-circuits to the stored digest (200) or enqueues a DIGEST job
  // and returns 202 + jobId. The buildDigest LLM call runs on the worker (see
  // ADR) — the HTTP layer never blocks on it. Poll GET generate/:jobId.
  @Post('generate')
  async generate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GenerateDigestDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DigestGenerateResult> {
    const result = await this.digests.enqueueOrGet(user.id, dto.periodType, dto.date);
    res.status(result.status === 'existing' ? 200 : 202);
    return result;
  }

  // Status of a digest job for polling. Two path segments, so it doesn't
  // collide with the single-segment `:id` route. Cross-tenant / unknown jobs
  // both 404 (the project-wide don't-acknowledge-existence convention).
  @Get('generate/:jobId')
  generateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('jobId') jobId: string,
  ): Promise<DigestJobStatus> {
    return this.digests.getJobStatus(user.id, jobId);
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
