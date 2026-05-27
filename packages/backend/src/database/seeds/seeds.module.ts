import { Module } from '@nestjs/common';
import { AxesModule } from '../../axes/axes.module';
import { FeedsModule } from '../../feeds/feeds.module';
import { DemoSeedBootstrap } from './demo-seed.bootstrap';
import { DemoSeedService } from './demo-seed.service';

/**
 * Wires DemoSeedService and its boot-time runner. AxesModule is imported
 * so we can call AxesService.seedDefaultsForUser inside the seed
 * transaction; FeedsModule provides UrlNormalizerService.
 *
 * The bootstrapper checks SEED_DEMO_ON_BOOT and invokes the service after
 * migrations have run.
 */
@Module({
  imports: [AxesModule, FeedsModule],
  providers: [DemoSeedService, DemoSeedBootstrap],
  exports: [DemoSeedService],
})
export class SeedsModule {}
