import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SocialConnection } from '../../database/entities';
import { BaseOAuthService } from '../base-oauth.service';
import { OAuthStateManager } from '../utils/state-manager';
import {
  OAuthPlatform,
  OAuthConfig,
  OAuthUserInfo,
  OAuthCallbackResult,
  OAuthTokenResponse,
} from '../interfaces';
import { getErrorMessage, getErrorStack } from '../../common/utils/error.utils';

/**
 * Google user info response
 */
interface GoogleUserInfo {
  id: string;
  email?: string;
  verified_email?: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
}

/**
 * YouTube channel response
 */
interface YouTubeChannelResponse {
  items?: Array<{
    id: string;
    snippet: {
      title: string;
      description: string;
      customUrl?: string;
      thumbnails?: {
        default?: { url: string };
        medium?: { url: string };
        high?: { url: string };
      };
    };
  }>;
}

/**
 * YouTube OAuth Service
 * Implements Google OAuth 2.0 flow for YouTube
 */
@Injectable()
export class YouTubeOAuthService extends BaseOAuthService {
  protected readonly platform: OAuthPlatform = 'youtube';
  protected readonly config: OAuthConfig;

  private readonly youtubeChannelUrl =
    'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true';

  constructor(
    @InjectRepository(SocialConnection)
    socialConnectionRepository: Repository<SocialConnection>,
    stateManager: OAuthStateManager,
    private readonly configService: ConfigService,
  ) {
    super(socialConnectionRepository, stateManager);
    this.config = this.loadConfig();

    if (!this.isConfigured()) {
      this.logger.warn(
        'YouTube OAuth credentials not configured. Authentication will not work.',
      );
    }
  }

  private loadConfig(): OAuthConfig {
    return {
      clientId: this.configService.get<string>('YOUTUBE_CLIENT_ID') || '',
      clientSecret:
        this.configService.get<string>('YOUTUBE_CLIENT_SECRET') || '',
      redirectUri:
        this.configService.get<string>('YOUTUBE_REDIRECT_URI') ||
        'http://localhost:3000/api/oauth/youtube/callback',
      scopes: [
        'https://www.googleapis.com/auth/youtube.upload',
        'https://www.googleapis.com/auth/youtube',
        'https://www.googleapis.com/auth/userinfo.profile',
      ],
      authorizationUrl: 'https://accounts.google.com/o/oauth2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
    };
  }

  /**
   * Generate authorization URL with Google-specific parameters
   */
  override getAuthorizationUrl(userId: string): { url: string; state: string } {
    if (!this.isConfigured()) {
      throw new Error(
        'YouTube OAuth is not configured. Please set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET.',
      );
    }

    const state = this.stateManager.generateState(userId, this.platform);

    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      scope: this.config.scopes.join(' '),
      state,
      access_type: 'offline', // Request refresh token
      prompt: 'consent', // Force consent to get refresh token
    });

    const url = `${this.config.authorizationUrl}?${params.toString()}`;

    this.logger.log(`Generated YouTube authorization URL for user ${userId}`);

    return { url, state };
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForToken(
    code: string,
    state: string,
  ): Promise<OAuthCallbackResult> {
    try {
      this.logger.log('Exchanging authorization code for access token');

      // Validate and consume state
      const stateData = this.stateManager.validateAndConsumeState(state);
      if (!stateData) {
        throw new Error(
          'Invalid or expired state parameter. Please try authenticating again.',
        );
      }

      const { userId } = stateData;

      // Exchange code for tokens
      const tokenResponse = await this.fetchGoogleTokens(code);

      // Get user info from Google
      const googleUserInfo = await this.fetchGoogleUserInfo(
        tokenResponse.access_token,
      );

      // Get YouTube channel info
      const channelInfo = await this.fetchYouTubeChannel(
        tokenResponse.access_token,
      );

      // Build user info with YouTube channel data
      const userInfo = this.buildUserInfo(googleUserInfo, channelInfo);

      // Save connection
      const connection = await this.saveToken(userId, tokenResponse, userInfo);

      this.logger.log(
        `Successfully authenticated YouTube user: ${userInfo.displayName} (${userInfo.id})`,
      );

      return {
        success: true,
        userId,
        platform: this.platform,
        platformUserId: userInfo.id,
        platformUsername: userInfo.username,
        scopes: connection.scopes,
        expiresAt: connection.expiresAt || undefined,
        metadata: userInfo.metadata,
      };
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      const errorStack = getErrorStack(error);
      this.logger.error(
        `Failed to exchange code for token: ${errorMessage}`,
        errorStack,
      );
      throw new Error(`YouTube authentication failed: ${errorMessage}`);
    }
  }

  /**
   * Fetch tokens from Google
   */
  private async fetchGoogleTokens(code: string): Promise<OAuthTokenResponse> {
    const params = new URLSearchParams({
      code,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      redirect_uri: this.config.redirectUri,
      grant_type: 'authorization_code',
    });

    const response = await fetch(this.config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Token exchange failed (${response.status}): ${errorText}`,
      );
    }

    return (await response.json()) as OAuthTokenResponse;
  }

  /**
   * Refresh access token
   */
  override async refreshAccessToken(
    connection: SocialConnection,
  ): Promise<SocialConnection> {
    try {
      this.logger.log(`Refreshing access token for user: ${connection.userId}`);

      if (!connection.refreshToken) {
        throw new Error(
          'No refresh token available. User needs to re-authenticate.',
        );
      }

      const params = new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        refresh_token: connection.refreshToken,
        grant_type: 'refresh_token',
      });

      const response = await fetch(this.config.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Token refresh failed (${response.status}): ${errorText}`,
        );
      }

      const tokenData = (await response.json()) as OAuthTokenResponse;

      // Update tokens (Google doesn't always return a new refresh token)
      const now = new Date();
      connection.accessToken = tokenData.access_token;
      if (tokenData.refresh_token) {
        connection.refreshToken = tokenData.refresh_token;
      }
      connection.expiresAt = tokenData.expires_in
        ? new Date(now.getTime() + tokenData.expires_in * 1000)
        : connection.expiresAt;

      if (tokenData.scope) {
        connection.scopes = tokenData.scope.split(' ');
      }

      await this.socialConnectionRepository.save(connection);

      this.logger.log('Access token refreshed successfully');

      return connection;
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      const errorStack = getErrorStack(error);
      this.logger.error(
        `Failed to refresh access token: ${errorMessage}`,
        errorStack,
      );
      throw new Error(`Token refresh failed: ${errorMessage}`);
    }
  }

  /**
   * Fetch user info from Google
   */
  private async fetchGoogleUserInfo(
    accessToken: string,
  ): Promise<GoogleUserInfo> {
    const response = await fetch(this.config.userInfoUrl!, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to fetch user info (${response.status}): ${errorText}`,
      );
    }

    return (await response.json()) as GoogleUserInfo;
  }

  /**
   * Fetch YouTube channel info
   */
  private async fetchYouTubeChannel(
    accessToken: string,
  ): Promise<YouTubeChannelResponse> {
    const response = await fetch(this.youtubeChannelUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.warn(
        `Failed to fetch YouTube channel info (${response.status}): ${errorText}`,
      );
      // Return empty response, channel info is optional
      return { items: [] };
    }

    return (await response.json()) as YouTubeChannelResponse;
  }

  /**
   * Build user info from Google and YouTube data
   */
  private buildUserInfo(
    googleUser: GoogleUserInfo,
    channelInfo: YouTubeChannelResponse,
  ): OAuthUserInfo {
    const channel = channelInfo.items?.[0];

    return {
      id: channel?.id || googleUser.id,
      username: channel?.snippet?.customUrl || googleUser.email,
      displayName: channel?.snippet?.title || googleUser.name,
      email: googleUser.email,
      avatarUrl:
        channel?.snippet?.thumbnails?.default?.url || googleUser.picture,
      metadata: {
        googleId: googleUser.id,
        channelId: channel?.id,
        channelTitle: channel?.snippet?.title,
        channelDescription: channel?.snippet?.description,
        channelCustomUrl: channel?.snippet?.customUrl,
        channelThumbnail: channel?.snippet?.thumbnails?.high?.url,
      },
    };
  }

  /**
   * Fetch user info (required by base class)
   */
  protected async fetchUserInfo(accessToken: string): Promise<OAuthUserInfo> {
    const googleUser = await this.fetchGoogleUserInfo(accessToken);
    const channelInfo = await this.fetchYouTubeChannel(accessToken);
    return this.buildUserInfo(googleUser, channelInfo);
  }

  /**
   * Get YouTube channel ID for a user
   */
  async getChannelId(userId: string): Promise<string | null> {
    const connection = await this.getConnection(userId);
    if (!connection || !connection.metadata) {
      return null;
    }
    return (connection.metadata as Record<string, string>).channelId || null;
  }

  /**
   * Get access token for API calls (convenience method)
   */
  async getAccessToken(userId: string): Promise<string | null> {
    const connection = await this.getConnection(userId);
    return connection?.accessToken || null;
  }
}
