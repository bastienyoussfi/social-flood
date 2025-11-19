import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RedditAdapter } from './reddit.adapter';
import { RedditService } from './reddit.service';
import { RedditProcessor } from './reddit.processor';
import { RedditApiClient } from './reddit-api.client';
import { RedditMediaService } from './reddit-media.service';
import { RedditQueueService } from './reddit-queue.service';
import { PlatformPost, Post } from '../../database/entities';

/**
 * Reddit Module
 * Provides complete Reddit integration with posting capabilities
 *
 * Architecture:
 * - RedditAdapter: Queue interface for posting
 * - RedditProcessor: Processes jobs from the queue
 * - RedditService: Orchestrates posting logic
 * - RedditApiClient: Handles Reddit OAuth2 API communication
 * - RedditMediaService: Handles media upload via S3
 * - RedditQueueService: Handles queue events and database updates
 */
@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([PlatformPost, Post]),
    BullModule.registerQueue({
      name: 'reddit-posts',
    }),
  ],
  providers: [
    RedditApiClient,
    RedditMediaService,
    RedditService,
    RedditAdapter,
    RedditProcessor,
    RedditQueueService,
  ],
  exports: [RedditAdapter, RedditService],
})
export class RedditModule {}
