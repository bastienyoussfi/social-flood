import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PinterestAdapter } from './pinterest.adapter';
import { PinterestService } from './pinterest.service';
import { PinterestProcessor } from './pinterest.processor';
import { PinterestApiClient } from './pinterest-api.client';
import { PinterestMediaService } from './pinterest-media.service';
import { PinterestQueueService } from './pinterest-queue.service';
import { PlatformPost, Post } from '../../database/entities';

/**
 * Pinterest Module
 * Provides complete Pinterest integration with pin posting capabilities
 *
 * Architecture:
 * - PinterestAdapter: Queue interface for posting
 * - PinterestProcessor: Processes jobs from the queue
 * - PinterestService: Orchestrates posting logic
 * - PinterestApiClient: Handles Pinterest API v5 communication
 * - PinterestMediaService: Handles media validation
 * - PinterestQueueService: Handles queue events and database updates
 */
@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([PlatformPost, Post]),
    BullModule.registerQueue({
      name: 'pinterest-posts',
    }),
  ],
  providers: [
    PinterestApiClient,
    PinterestMediaService,
    PinterestService,
    PinterestAdapter,
    PinterestProcessor,
    PinterestQueueService,
  ],
  exports: [PinterestAdapter, PinterestService],
})
export class PinterestModule {}
