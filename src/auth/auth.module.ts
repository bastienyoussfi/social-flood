import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TikTokAuth, OAuthToken } from '../database/entities';
import { TikTokAuthController } from './tiktok-auth.controller';
import { TikTokAuthService } from './tiktok-auth.service';
import { TwitterAuthController } from './twitter-auth.controller';
import { TwitterAuthService } from './twitter-auth.service';

/**
 * Authentication Module
 * Handles OAuth flows for social media platforms
 */
@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([TikTokAuth, OAuthToken])],
  controllers: [TikTokAuthController, TwitterAuthController],
  providers: [TikTokAuthService, TwitterAuthService],
  exports: [TikTokAuthService, TwitterAuthService],
})
export class AuthModule {}
