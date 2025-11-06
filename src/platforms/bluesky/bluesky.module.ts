import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule } from '@nestjs/config';
import { BlueskyAdapter } from './bluesky.adapter';
import { BlueskyService } from './bluesky.service';
import { BlueskyProcessor } from './bluesky.processor';

@Module({
  imports: [
    ConfigModule,
    BullModule.registerQueue({
      name: 'bluesky-posts',
    }),
  ],
  providers: [BlueskyAdapter, BlueskyService, BlueskyProcessor],
  exports: [BlueskyAdapter],
})
export class BlueskyModule {}
