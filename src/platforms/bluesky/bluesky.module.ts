import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BlueskyController } from './bluesky.controller';
import { BlueskyAdapter } from './bluesky.adapter';
import { BlueskyService } from './bluesky.service';
import { BlueskyProcessor } from './bluesky.processor';
import { BlueskyApiClient } from './bluesky-api.client';
import { BlueskyMediaService } from './bluesky-media.service';
import { BlueskyQueueService } from './bluesky-queue.service';
import { PlatformPost, Post } from '../../database/entities';

/**
 * Bluesky Module
 * Provides complete Bluesky integration with posting capabilities
 *
 * Architecture:
 * - BlueskyController: REST API endpoints for Bluesky
 * - BlueskyAdapter: Queue interface for posting
 * - BlueskyProcessor: Processes jobs from the queue
 * - BlueskyService: Orchestrates posting logic
 * - BlueskyApiClient: Handles Bluesky AT Protocol API communication
 * - BlueskyMediaService: Handles media upload as blobs
 * - BlueskyQueueService: Handles queue events and database updates
 */
@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([PlatformPost, Post]),
    BullModule.registerQueue({
      name: 'bluesky-posts',
    }),
  ],
  controllers: [BlueskyController],
  providers: [
    BlueskyApiClient,
    BlueskyMediaService,
    BlueskyService,
    BlueskyAdapter,
    BlueskyProcessor,
    BlueskyQueueService,
  ],
  exports: [BlueskyAdapter, BlueskyService],
})
export class BlueskyModule {}
