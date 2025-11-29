import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InstagramController } from './instagram.controller';
import { InstagramAdapter } from './instagram.adapter';
import { InstagramService } from './instagram.service';
import { InstagramProcessor } from './instagram.processor';
import { InstagramApiClient } from './instagram-api.client';
import { InstagramMediaService } from './instagram-media.service';
import { InstagramQueueService } from './instagram-queue.service';
import { PlatformPost, Post } from '../../database/entities';
import { AuthModule } from '../../auth/auth.module';

/**
 * Instagram Module
 * Provides complete Instagram integration with posting capabilities
 *
 * OAuth authentication is handled by the centralized AuthModule.
 * This module imports AuthModule to access InstagramOAuthService.
 *
 * Architecture:
 * - InstagramController: REST API endpoints for Instagram
 * - InstagramAdapter: Queue interface for posting
 * - InstagramProcessor: Processes jobs from the queue
 * - InstagramService: Orchestrates posting logic
 * - InstagramApiClient: Handles Instagram Graph API communication
 * - InstagramMediaService: Handles media validation and processing
 * - InstagramQueueService: Handles queue events and database updates
 *
 * Instagram API Notes:
 * - Uses Meta's Instagram Graph API for Business/Creator accounts
 * - Requires a Facebook Page linked to Instagram Business Account
 * - Posts are created via a 2-step container-based publishing flow
 * - Supports images, videos, and carousels (up to 10 items)
 */
@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([PlatformPost, Post]),
    BullModule.registerQueue({
      name: 'instagram-posts',
    }),
    forwardRef(() => AuthModule),
  ],
  controllers: [InstagramController],
  providers: [
    InstagramApiClient,
    InstagramMediaService,
    InstagramService,
    InstagramAdapter,
    InstagramProcessor,
    InstagramQueueService,
  ],
  exports: [InstagramAdapter, InstagramService],
})
export class InstagramModule {}
