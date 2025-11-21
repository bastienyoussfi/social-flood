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
import { PinterestOAuthService } from './pinterest-oauth.service';
import { PinterestOAuthController } from './pinterest-oauth.controller';
import { PlatformPost, Post, OAuthToken } from '../../database/entities';

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
 * - PinterestOAuthService: Handles OAuth 2.0 authentication and token management
 * - PinterestOAuthController: OAuth endpoints for user authorization
 */
@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([PlatformPost, Post, OAuthToken]),
    BullModule.registerQueue({
      name: 'pinterest-posts',
    }),
  ],
  controllers: [PinterestOAuthController],
  providers: [
    PinterestApiClient,
    PinterestMediaService,
    PinterestService,
    PinterestAdapter,
    PinterestProcessor,
    PinterestQueueService,
    PinterestOAuthService,
  ],
  exports: [PinterestAdapter, PinterestService, PinterestOAuthService],
})
export class PinterestModule {}
