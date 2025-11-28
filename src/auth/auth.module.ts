import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OAuthToken } from '../database/entities';

// State Manager
import { OAuthStateManager } from './utils/state-manager';

// OAuth Services
import { TwitterOAuthService } from './services/twitter-oauth.service';
import { TikTokOAuthService } from './services/tiktok-oauth.service';
import { LinkedInOAuthService } from './services/linkedin-oauth.service';
import { PinterestOAuthService } from './services/pinterest-oauth.service';

// OAuth Controllers
import { TwitterOAuthController } from './controllers/twitter-oauth.controller';
import { TikTokOAuthController } from './controllers/tiktok-oauth.controller';
import { LinkedInOAuthController } from './controllers/linkedin-oauth.controller';
import { PinterestOAuthController } from './controllers/pinterest-oauth.controller';

/**
 * Authentication Module
 * Centralized OAuth 2.0 flows for all social media platforms
 *
 * All OAuth endpoints follow a consistent pattern:
 * - GET /api/auth/{platform}/login?userId=xxx - Initiate OAuth flow
 * - GET /api/auth/{platform}/callback - Handle OAuth callback
 * - GET /api/auth/{platform}/status?userId=xxx - Check connection status
 * - DELETE /api/auth/{platform}/:userId - Disconnect user
 * - GET /api/auth/{platform}/users - List all authenticated users (admin)
 *
 * Supported platforms:
 * - Twitter (OAuth 2.0 with PKCE)
 * - TikTok (OAuth 2.0)
 * - LinkedIn (OAuth 2.0)
 * - Pinterest (OAuth 2.0)
 */
@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([OAuthToken])],
  controllers: [
    TwitterOAuthController,
    TikTokOAuthController,
    LinkedInOAuthController,
    PinterestOAuthController,
  ],
  providers: [
    // Shared utilities
    OAuthStateManager,
    // Platform-specific OAuth services
    TwitterOAuthService,
    TikTokOAuthService,
    LinkedInOAuthService,
    PinterestOAuthService,
  ],
  exports: [
    // Export services for use in platform modules
    TwitterOAuthService,
    TikTokOAuthService,
    LinkedInOAuthService,
    PinterestOAuthService,
    OAuthStateManager,
  ],
})
export class AuthModule {}
