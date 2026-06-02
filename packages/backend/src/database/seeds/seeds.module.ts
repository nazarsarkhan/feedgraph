import { Module } from '@nestjs/common';
import { AxesModule } from '../../axes/axes.module';
import { FeedsModule } from '../../feeds/feeds.module';
import { GraphEntitiesModule } from '../../graph-entities/graph-entities.module';
import { DemoSeedBootstrap } from './demo-seed.bootstrap';
import { DemoSeedService } from './demo-seed.service';

/**
 * Wires DemoSeedService and its boot-time runner. AxesModule is imported
 * so we can call AxesService.seedDefaultsForUser inside the seed
 * transaction; FeedsModule provides UrlNormalizerService; GraphEntitiesModule
 * provides CoMentionViewService to refresh the co-mention view post-seed.
 *
 * The bootstrapper checks SEED_DEMO_ON_BOOT and invokes the service after
 * migrations have run.
 */
@Module({
  imports: [AxesModule, FeedsModule, GraphEntitiesModule],
  providers: [DemoSeedService, DemoSeedBootstrap],
  exports: [DemoSeedService],
})
export class SeedsModule {}
