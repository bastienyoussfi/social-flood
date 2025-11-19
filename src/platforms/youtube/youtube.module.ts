import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { YoutubeAdapter } from './youtube.adapter';
import { YoutubeService } from './youtube.service';
import { YoutubeProcessor } from './youtube.processor';
import { YoutubeApiClient } from './youtube-api.client';
import { YoutubeMediaService } from './youtube-media.service';
import { YoutubeQueueService } from './youtube-queue.service';
import { PlatformPost, Post } from '../../database/entities';

/**
 * YouTube Module
 * Provides complete YouTube integration with video posting capabilities
 *
 * Architecture:
 * - YoutubeAdapter: Queue interface for posting
 * - YoutubeProcessor: Processes jobs from the queue
 * - YoutubeService: Orchestrates posting logic
 * - YoutubeApiClient: Handles YouTube Data API v3 communication with OAuth 2.0
 * - YoutubeMediaService: Handles video download and validation
 * - YoutubeQueueService: Handles queue events and database updates
 */
@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([PlatformPost, Post]),
    BullModule.registerQueue({
      name: 'youtube-posts',
    }),
  ],
  providers: [
    YoutubeApiClient,
    YoutubeMediaService,
    YoutubeService,
    YoutubeAdapter,
    YoutubeProcessor,
    YoutubeQueueService,
  ],
  exports: [YoutubeAdapter, YoutubeService],
})
export class YoutubeModule {}
