import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TwitterAdapter } from './twitter.adapter';
import { TwitterService } from './twitter.service';
import { TwitterProcessor } from './twitter.processor';
import { TwitterApiClient } from './twitter-api.client';
import { TwitterMediaService } from './twitter-media.service';
import { TwitterQueueService } from './twitter-queue.service';
import { PlatformPost, Post } from '../../database/entities';

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
 * - TwitterQueueService: Handles queue events and database updates
 */
@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([PlatformPost, Post]),
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
    TwitterQueueService,
  ],
  exports: [TwitterAdapter, TwitterService],
})
export class TwitterModule {}
