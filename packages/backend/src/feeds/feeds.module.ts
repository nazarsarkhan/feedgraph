import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { FeedValidatorService } from './feed-validator.service';
import { FeedsController } from './feeds.controller';
import { FeedsService } from './feeds.service';
import { Feed } from './feed.entity';

@Module({
  // UsersModule is imported explicitly so EmailConfirmedGuard (provided by
  // AuthModule but depending on UsersService) can resolve at injection time.
  imports: [TypeOrmModule.forFeature([Feed]), AuthModule, UsersModule],
  controllers: [FeedsController],
  providers: [FeedsService, FeedValidatorService],
  exports: [FeedsService],
})
export class FeedsModule {}
