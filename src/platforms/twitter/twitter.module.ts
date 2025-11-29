import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TwitterController } from './twitter.controller';
import { TwitterAdapter } from './twitter.adapter';
import { TwitterService } from './twitter.service';
import { TwitterProcessor } from './twitter.processor';
import { TwitterApiClient } from './twitter-api.client';
import { TwitterMediaService } from './twitter-media.service';
import { TwitterQueueService } from './twitter-queue.service';
import { PlatformPost, Post } from '../../database/entities';
import { AuthModule } from '../../auth/auth.module';
import { ConnectionsModule } from '../../connections/connections.module';

/**
 * Twitter Module
 * Provides complete Twitter integration with posting capabilities
 *
 * Architecture:
 * - TwitterController: REST API endpoints for Twitter
 * - TwitterAdapter: Queue interface for posting
 * - TwitterProcessor: Processes jobs from the queue
 * - TwitterService: Orchestrates posting logic
 * - TwitterApiClient: Handles Twitter API v2 communication
 * - TwitterMediaService: Handles media upload
 * - TwitterQueueService: Handles queue events and database updates
 *
 * Supports both:
 * - OAuth 1.0a: App-level posting (using env credentials)
 * - OAuth 2.0: User-level posting (via AuthModule)
 */
@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([PlatformPost, Post]),
    BullModule.registerQueue({
      name: 'twitter-posts',
    }),
    forwardRef(() => AuthModule),
    ConnectionsModule,
  ],
  controllers: [TwitterController],
  providers: [
    TwitterApiClient,
    TwitterMediaService,
    TwitterService,
    TwitterAdapter,
    TwitterProcessor,
    TwitterQueueService,
  ],
  exports: [TwitterAdapter, TwitterService],
})
export class TwitterModule {}
