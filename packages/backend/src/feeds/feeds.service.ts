import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { CreateFeedDto } from './dto/create-feed.dto';
import { Feed, FeedStatus } from './feed.entity';
import { FeedValidatorService } from './feed-validator.service';

/**
 * Multi-tenant contract: every public method in this service takes
 * userId as a parameter (or is invoked from a context that has it),
 * and every WHERE clause MUST filter by user_id. Users never see
 * other users' feeds. This is enforced here at the data-access layer
 * (not just in the controller) per Principle 4 of the spec.
 */
@Injectable()
export class FeedsService {
  private readonly logger = new Logger(FeedsService.name);

  constructor(
    @InjectRepository(Feed) private readonly feeds: Repository<Feed>,
    private readonly validator: FeedValidatorService,
  ) {}

  findAllForUser(userId: string): Promise<Feed[]> {
    return this.feeds.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }

  async findOneForUser(userId: string, feedId: string): Promise<Feed> {
    const feed = await this.feeds.findOne({ where: { id: feedId, userId } });
    if (!feed) {
      // 404 (not 403) on cross-tenant access: never acknowledge that
      // someone else's feed exists. Same code path as "doesn't exist at all".
      throw new NotFoundException('Feed not found');
    }
    return feed;
  }

  async create(userId: string, dto: CreateFeedDto): Promise<Feed> {
    const validation = await this.validator.validate(dto.url);
    if (!validation.ok) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        message: validation.reason,
        error: 'FEED_VALIDATION_FAILED',
      });
    }
    const feed = this.feeds.create({
      userId,
      url: dto.url,
      name: dto.name ?? validation.title ?? null,
      status: 'active' as FeedStatus,
    });
    try {
      const saved = await this.feeds.save(feed);
      this.logger.log(`feed created user=${userId} feed=${saved.id} url=${saved.url}`);
      return saved;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException('Feed with this URL already exists');
      }
      throw err;
    }
  }

  async updateStatus(
    userId: string,
    feedId: string,
    status: Exclude<FeedStatus, 'error'>,
  ): Promise<Feed> {
    const feed = await this.findOneForUser(userId, feedId);
    feed.status = status;
    const saved = await this.feeds.save(feed);
    this.logger.log(`feed status changed user=${userId} feed=${feedId} status=${status}`);
    return saved;
  }

  async remove(userId: string, feedId: string): Promise<void> {
    const feed = await this.findOneForUser(userId, feedId);
    await this.feeds.remove(feed);
    this.logger.log(`feed deleted user=${userId} feed=${feedId}`);
  }
}

// Postgres unique-constraint violations come through as code 23505 on the
// pg driver error wrapped by TypeORM's QueryFailedError.
function isUniqueViolation(err: unknown): boolean {
  if (!(err instanceof QueryFailedError)) return false;
  const driver = err.driverError as { code?: string } | undefined;
  return driver?.code === '23505';
}
