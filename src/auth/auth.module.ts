import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TikTokAuth } from '../database/entities';
import { TikTokAuthController } from './tiktok-auth.controller';
import { TikTokAuthService } from './tiktok-auth.service';

/**
 * Authentication Module
 * Handles OAuth flows for social media platforms
 */
@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([TikTokAuth])],
  controllers: [TikTokAuthController],
  providers: [TikTokAuthService],
  exports: [TikTokAuthService],
})
export class AuthModule {}
