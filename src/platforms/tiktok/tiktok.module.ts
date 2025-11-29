import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TikTokController } from './tiktok.controller';
import { TikTokAdapter } from './tiktok.adapter';
import { TikTokService } from './tiktok.service';
import { TikTokProcessor } from './tiktok.processor';
import { TikTokApiClient } from './tiktok-api.client';
import { TikTokMediaService } from './tiktok-media.service';
import { TikTokQueueService } from './tiktok-queue.service';
import { PlatformPost, Post } from '../../database/entities';
import { AuthModule } from '../../auth/auth.module';

/**
 * TikTok Module
 * Provides complete TikTok integration with video posting capabilities
 *
 * OAuth authentication is handled by the centralized AuthModule.
 * This module imports AuthModule to access TikTokOAuthService.
 *
 * Architecture:
 * - TikTokController: REST API endpoints for TikTok
 * - TikTokAdapter: Queue interface for posting
 * - TikTokProcessor: Processes jobs from the queue
 * - TikTokService: Orchestrates posting logic
 * - TikTokApiClient: Handles TikTok Content Posting API v2 communication
 * - TikTokMediaService: Handles video download and chunked upload
 * - TikTokQueueService: Handles queue events and database updates
 */
@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([PlatformPost, Post]),
    BullModule.registerQueue({
      name: 'tiktok-posts',
    }),
    forwardRef(() => AuthModule),
  ],
  controllers: [TikTokController],
  providers: [
    TikTokApiClient,
    TikTokMediaService,
    TikTokService,
    TikTokAdapter,
    TikTokProcessor,
    TikTokQueueService,
  ],
  exports: [TikTokAdapter, TikTokService],
})
export class TikTokModule {}
