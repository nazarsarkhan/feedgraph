import { InjectQueue } from '@nestjs/bullmq';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  type MessageEvent,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { CurrentUser } from '../auth/current-user.decorator';
import { EmailConfirmedGuard } from '../auth/email-confirmed.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/types';
import { QUEUE_NAMES } from '../queue/queue-names';
import { CreateFeedDto } from './dto/create-feed.dto';
import { FeedEventsService } from './feed-events.service';
import { Feed } from './feed.entity';
import { FeedsService } from './feeds.service';

@Controller('feeds')
@UseGuards(JwtAuthGuard, EmailConfirmedGuard)
export class FeedsController {
  constructor(
    private readonly feeds: FeedsService,
    @InjectQueue(QUEUE_NAMES.FEED_POLL) private readonly pollQueue: Queue,
    private readonly events: FeedEventsService,
  ) {}

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

  @Post(':id/poll-now')
  @HttpCode(HttpStatus.ACCEPTED)
  async pollNow(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ message: string; feedId: string }> {
    // findOneForUser enforces tenancy; only after ownership is verified do
    // we enqueue. The worker itself runs system-wide and doesn't re-check.
    const feed = await this.feeds.findOneForUser(user.id, id);
    await this.pollQueue.add(
      'poll',
      { feedId: feed.id },
      { attempts: 3, backoff: { type: 'exponential', delay: 30_000 } },
    );
    return { message: 'Polling scheduled', feedId: feed.id };
  }

  /**
   * Server-Sent Events stream of poll lifecycle events for one feed. The
   * frontend opens an EventSource here after clicking "Poll now" and refreshes
   * the moment a `polled`/`error` event arrives, instead of guessing with a
   * fixed delay. GET, so the CsrfGuard exempts it; the controller's JWT +
   * email-confirmed guards still apply. Awaiting the ownership check first
   * yields a clean 404 on a cross-tenant id before the stream opens (Nest
   * awaits the handler's promise before writing the SSE headers).
   */
  @Sse(':id/poll-status')
  async pollStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Observable<MessageEvent>> {
    await this.feeds.findOneForUser(user.id, id);
    return this.events.streamForFeed(id).pipe(map((event) => ({ data: event }) as MessageEvent));
  }
}
