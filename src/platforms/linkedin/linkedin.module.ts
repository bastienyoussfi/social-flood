import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LinkedInAdapter } from './linkedin.adapter';
import { LinkedInService } from './linkedin.service';
import { LinkedInProcessor } from './linkedin.processor';
import { LinkedInApiClient } from './linkedin-api.client';
import { LinkedInMediaService } from './linkedin-media.service';
import { LinkedInQueueService } from './linkedin-queue.service';
import { PlatformPost, Post } from '../../database/entities';
import { AuthModule } from '../../auth/auth.module';

/**
 * LinkedIn Module
 * Provides complete LinkedIn integration with posting capabilities
 *
 * OAuth authentication is handled by the centralized AuthModule.
 * This module imports AuthModule to access LinkedInOAuthService.
 *
 * Architecture:
 * - LinkedInAdapter: Queue interface for posting
 * - LinkedInProcessor: Processes jobs from the queue
 * - LinkedInService: Orchestrates posting logic
 * - LinkedInApiClient: Handles LinkedIn REST API v2 communication
 * - LinkedInMediaService: Handles media upload
 * - LinkedInQueueService: Handles queue events and database updates
 */
@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([PlatformPost, Post]),
    BullModule.registerQueue({
      name: 'linkedin-posts',
    }),
    forwardRef(() => AuthModule),
  ],
  controllers: [],
  providers: [
    LinkedInApiClient,
    LinkedInMediaService,
    LinkedInService,
    LinkedInAdapter,
    LinkedInProcessor,
    LinkedInQueueService,
  ],
  exports: [LinkedInAdapter, LinkedInService],
})
export class LinkedInModule {}
