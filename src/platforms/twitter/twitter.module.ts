import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule } from '@nestjs/config';
import { TwitterAdapter } from './twitter.adapter';
import { TwitterService } from './twitter.service';
import { TwitterProcessor } from './twitter.processor';
import { TwitterApiClient } from './twitter-api.client';
import { TwitterMediaService } from './twitter-media.service';

/**
 * Twitter Module
 * Provides complete Twitter integration with posting capabilities
 *
 * Architecture:
 * - TwitterAdapter: Queue interface for posting
 * - TwitterProcessor: Processes jobs from the queue
 * - TwitterService: Orchestrates posting logic
 * - TwitterApiClient: Handles Twitter API v2 communication
 * - TwitterMediaService: Handles media upload
 */
@Module({
  imports: [
    ConfigModule,
    BullModule.registerQueue({
      name: 'twitter-posts',
    }),
  ],
  providers: [
    TwitterApiClient,
    TwitterMediaService,
    TwitterService,
    TwitterAdapter,
    TwitterProcessor,
  ],
  exports: [TwitterAdapter, TwitterService],
})
export class TwitterModule {}
