import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { EmailConfirmedGuard } from '../auth/email-confirmed.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/types';
import { CreateFeedDto } from './dto/create-feed.dto';
import { Feed } from './feed.entity';
import { FeedsService } from './feeds.service';

@Controller('feeds')
@UseGuards(JwtAuthGuard, EmailConfirmedGuard)
export class FeedsController {
  constructor(private readonly feeds: FeedsService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateFeedDto): Promise<Feed> {
    return this.feeds.create(user.id, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<Feed[]> {
    return this.feeds.findAllForUser(user.id);
  }

  @Get(':id')
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Feed> {
    return this.feeds.findOneForUser(user.id, id);
  }

  @Patch(':id/pause')
  pause(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Feed> {
    return this.feeds.updateStatus(user.id, id, 'paused');
  }

  @Patch(':id/resume')
  resume(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Feed> {
    return this.feeds.updateStatus(user.id, id, 'active');
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.feeds.remove(user.id, id);
  }
}
