import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LinkedInAdapter } from './linkedin.adapter';
import { LinkedInService } from './linkedin.service';
import { LinkedInProcessor } from './linkedin.processor';
import { LinkedInApiClient } from './linkedin-api.client';
import { LinkedInMediaService } from './linkedin-media.service';
import { LinkedInQueueService } from './linkedin-queue.service';
import { LinkedInOAuthService } from './linkedin-oauth.service';
import { LinkedInOAuthController } from './linkedin-oauth.controller';
import { PlatformPost, Post, OAuthToken } from '../../database/entities';

/**
 * LinkedIn Module
 * Provides complete LinkedIn integration with posting capabilities
 * and OAuth 2.0 authentication flow
 *
 * Architecture:
 * - LinkedInAdapter: Queue interface for posting
 * - LinkedInProcessor: Processes jobs from the queue
 * - LinkedInService: Orchestrates posting logic
 * - LinkedInApiClient: Handles LinkedIn REST API v2 communication
 * - LinkedInMediaService: Handles media upload
 * - LinkedInQueueService: Handles queue events and database updates
 * - LinkedInOAuthService: Handles OAuth 2.0 authentication flow
 * - LinkedInOAuthController: OAuth endpoints (login, callback, status, disconnect)
 */
@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([PlatformPost, Post, OAuthToken]),
    BullModule.registerQueue({
      name: 'linkedin-posts',
    }),
  ],
  controllers: [LinkedInOAuthController],
  providers: [
    LinkedInOAuthService,
    LinkedInApiClient,
    LinkedInMediaService,
    LinkedInService,
    LinkedInAdapter,
    LinkedInProcessor,
    LinkedInQueueService,
  ],
  exports: [LinkedInAdapter, LinkedInService, LinkedInOAuthService],
})
export class LinkedInModule {}
