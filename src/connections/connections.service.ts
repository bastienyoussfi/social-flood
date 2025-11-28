import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SocialConnection } from '../database/entities';
import { LinkedInOAuthService } from '../auth/services/linkedin-oauth.service';
import { TwitterOAuthService } from '../auth/services/twitter-oauth.service';
import { TikTokOAuthService } from '../auth/services/tiktok-oauth.service';
import { PinterestOAuthService } from '../auth/services/pinterest-oauth.service';
import { InstagramOAuthService } from '../auth/services/instagram-oauth.service';
import { YouTubeOAuthService } from '../auth/services/youtube-oauth.service';
import type { OAuthCallbackResult, OAuthInitResult } from '../auth/interfaces';

type SocialPlatform =
  | 'linkedin'
  | 'twitter'
  | 'tiktok'
  | 'pinterest'
  | 'instagram'
  | 'youtube';

/**
 * Connections Service
 * Orchestrates social platform OAuth flows and connection management
 */
@Injectable()
export class ConnectionsService {
  private readonly logger = new Logger(ConnectionsService.name);

  constructor(
    @InjectRepository(SocialConnection)
    private readonly connectionRepository: Repository<SocialConnection>,
    private readonly linkedInOAuth: LinkedInOAuthService,
    private readonly twitterOAuth: TwitterOAuthService,
    private readonly tiktokOAuth: TikTokOAuthService,
    private readonly pinterestOAuth: PinterestOAuthService,
    private readonly instagramOAuth: InstagramOAuthService,
    private readonly youtubeOAuth: YouTubeOAuthService,
  ) {}

  /**
   * Get the OAuth service for a platform
   */
  private getOAuthService(platform: SocialPlatform) {
    switch (platform) {
      case 'linkedin':
        return this.linkedInOAuth;
      case 'twitter':
        return this.twitterOAuth;
      case 'tiktok':
        return this.tiktokOAuth;
      case 'pinterest':
        return this.pinterestOAuth;
      case 'instagram':
        return this.instagramOAuth;
      case 'youtube':
        return this.youtubeOAuth;
      default: {
        const exhaustiveCheck: never = platform;
        throw new BadRequestException(
          `Unsupported platform: ${exhaustiveCheck as string}`,
        );
      }
    }
  }

  /**
   * Get all connections for a user
   */
  async getConnectionsForUser(userId: string): Promise<SocialConnection[]> {
    return this.connectionRepository.find({
      where: { userId, isActive: true },
      order: { platform: 'ASC', createdAt: 'DESC' },
    });
  }

  /**
   * Get connections by platform for a user
   */
  async getConnectionsByPlatform(
    userId: string,
    platform: SocialPlatform,
  ): Promise<SocialConnection[]> {
    return this.connectionRepository.find({
      where: { userId, platform, isActive: true },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get a connection by ID
   */
  async getConnectionById(id: string): Promise<SocialConnection | null> {
    return this.connectionRepository.findOne({
      where: { id },
    });
  }

  /**
   * Initiate OAuth connection flow for a platform
   */
  initiateConnection(
    userId: string,
    platform: SocialPlatform,
  ): OAuthInitResult {
    const oauthService = this.getOAuthService(platform);

    if (!oauthService.isConfigured()) {
      throw new BadRequestException(
        `${platform} OAuth is not configured. Please check your environment variables.`,
      );
    }

    this.logger.log(`Initiating ${platform} OAuth flow for user: ${userId}`);

    return oauthService.getAuthorizationUrl(userId);
  }

  /**
   * Handle OAuth callback for a platform
   */
  async handleCallback(
    platform: SocialPlatform,
    code: string,
    state: string,
  ): Promise<OAuthCallbackResult> {
    const oauthService = this.getOAuthService(platform);

    this.logger.log(`Processing ${platform} OAuth callback`);

    return oauthService.exchangeCodeForToken(code, state);
  }

  /**
   * Revoke a connection
   */
  async revokeConnection(connectionId: string): Promise<void> {
    await this.connectionRepository.update(
      { id: connectionId },
      { isActive: false },
    );

    this.logger.log(`Revoked connection: ${connectionId}`);
  }

  /**
   * Delete a connection
   */
  async deleteConnection(connectionId: string): Promise<void> {
    await this.connectionRepository.delete({ id: connectionId });

    this.logger.log(`Deleted connection: ${connectionId}`);
  }

  /**
   * Refresh tokens for a connection
   */
  async refreshConnection(connectionId: string): Promise<SocialConnection> {
    const connection = await this.connectionRepository.findOne({
      where: { id: connectionId },
    });

    if (!connection) {
      throw new BadRequestException('Connection not found');
    }

    const oauthService = this.getOAuthService(
      connection.platform as SocialPlatform,
    );

    this.logger.log(
      `Refreshing tokens for ${connection.platform} connection: ${connectionId}`,
    );

    return oauthService.refreshAccessToken(connection);
  }

  /**
   * Get a valid access token for a connection (auto-refresh if needed)
   */
  async getValidAccessToken(connectionId: string): Promise<string> {
    const connection = await this.connectionRepository.findOne({
      where: { id: connectionId, isActive: true },
    });

    if (!connection) {
      throw new BadRequestException('Connection not found or inactive');
    }

    // Check if token needs refresh
    if (connection.needsRefresh()) {
      this.logger.log(`Token needs refresh for connection: ${connectionId}`);

      const refreshedConnection = await this.refreshConnection(connectionId);
      return refreshedConnection.accessToken;
    }

    return connection.accessToken;
  }

  /**
   * Get connection count by platform for a user
   */
  async getConnectionCount(userId: string): Promise<Record<string, number>> {
    const connections = await this.connectionRepository.find({
      where: { userId, isActive: true },
      select: ['platform'],
    });

    const counts: Record<string, number> = {};
    for (const conn of connections) {
      counts[conn.platform] = (counts[conn.platform] || 0) + 1;
    }

    return counts;
  }
}
