import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PinterestController } from './pinterest.controller';
import { PinterestAdapter } from './pinterest.adapter';
import { PinterestService } from './pinterest.service';
import { PinterestProcessor } from './pinterest.processor';
import { PinterestApiClient } from './pinterest-api.client';
import { PinterestMediaService } from './pinterest-media.service';
import { PinterestQueueService } from './pinterest-queue.service';
import { PlatformPost, Post } from '../../database/entities';
import { AuthModule } from '../../auth/auth.module';

/**
 * Pinterest Module
 * Provides complete Pinterest integration with pin posting capabilities
 *
 * OAuth authentication is handled by the centralized AuthModule.
 * This module imports AuthModule to access PinterestOAuthService.
 *
 * Architecture:
 * - PinterestController: REST API endpoints for Pinterest
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
    forwardRef(() => AuthModule),
  ],
  controllers: [PinterestController],
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
