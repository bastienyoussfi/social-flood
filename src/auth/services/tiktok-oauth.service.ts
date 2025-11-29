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
 * TikTok Token Response extends the base with TikTok-specific fields
 */
interface TikTokTokenResponse extends OAuthTokenResponse {
  open_id: string;
  refresh_expires_in: number;
}

/**
 * TikTok User Info Response
 */
interface TikTokUserInfoResponse {
  data: {
    user: {
      open_id: string;
      union_id: string;
      avatar_url: string;
      display_name: string;
    };
  };
  error?: {
    code: string;
    message: string;
    log_id: string;
  };
}

/**
 * TikTok OAuth Service
 * Implements OAuth 2.0 flow for TikTok
 */
@Injectable()
export class TikTokOAuthService extends BaseOAuthService {
  protected readonly platform: OAuthPlatform = 'tiktok';
  protected readonly config: OAuthConfig;

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
        'TikTok OAuth credentials not configured. Authentication will not work.',
      );
    }
  }

  private loadConfig(): OAuthConfig {
    return {
      clientId: this.configService.get<string>('TIKTOK_CLIENT_KEY') || '',
      clientSecret:
        this.configService.get<string>('TIKTOK_CLIENT_SECRET') || '',
      redirectUri:
        this.configService.get<string>('TIKTOK_REDIRECT_URI') ||
        'http://localhost:3000/api/oauth/tiktok/callback',
      scopes: ['user.info.basic', 'video.upload', 'video.publish'],
      authorizationUrl: 'https://www.tiktok.com/v2/auth/authorize/',
      tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
      userInfoUrl:
        'https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name',
    };
  }

  /**
   * Generate authorization URL (TikTok uses client_key instead of client_id)
   */
  override getAuthorizationUrl(userId: string): { url: string; state: string } {
    if (!this.isConfigured()) {
      throw new Error(
        'TikTok OAuth is not configured. Please set TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET.',
      );
    }

    const state = this.stateManager.generateState(userId, this.platform);

    const params = new URLSearchParams({
      client_key: this.config.clientId,
      scope: this.config.scopes.join(','),
      response_type: 'code',
      redirect_uri: this.config.redirectUri,
      state,
    });

    const url = `${this.config.authorizationUrl}?${params.toString()}`;

    this.logger.log(`Generated TikTok authorization URL for user ${userId}`);

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
      const tokenResponse = await this.fetchTikTokTokens(code);

      // Get user info
      const userInfo = await this.fetchUserInfo(tokenResponse.access_token);

      // Save connection with TikTok-specific refresh_expires_in
      const connection = await this.saveToken(
        userId,
        tokenResponse,
        userInfo,
        tokenResponse.refresh_expires_in,
      );

      this.logger.log(
        `Successfully authenticated TikTok user: ${userInfo.displayName} (${userInfo.id})`,
      );

      return {
        success: true,
        userId,
        platform: this.platform,
        platformUserId: userInfo.id,
        platformUsername: userInfo.displayName,
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
      throw new Error(`TikTok authentication failed: ${errorMessage}`);
    }
  }

  /**
   * Fetch tokens from TikTok (uses client_key instead of client_id)
   */
  private async fetchTikTokTokens(code: string): Promise<TikTokTokenResponse> {
    const response = await fetch(this.config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_key: this.config.clientId,
        client_secret: this.config.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: this.config.redirectUri,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Token exchange failed (${response.status}): ${errorText}`,
      );
    }

    return (await response.json()) as TikTokTokenResponse;
  }

  /**
   * Refresh access token (TikTok-specific)
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

      if (connection.isRefreshTokenExpired()) {
        throw new Error(
          'Refresh token expired. User needs to re-authenticate.',
        );
      }

      const response = await fetch(this.config.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_key: this.config.clientId,
          client_secret: this.config.clientSecret,
          grant_type: 'refresh_token',
          refresh_token: connection.refreshToken,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Token refresh failed (${response.status}): ${errorText}`,
        );
      }

      const tokenData = (await response.json()) as TikTokTokenResponse;

      // Update tokens
      const now = new Date();
      connection.accessToken = tokenData.access_token;
      connection.refreshToken =
        tokenData.refresh_token || connection.refreshToken;
      connection.expiresAt = new Date(
        now.getTime() + tokenData.expires_in! * 1000,
      );
      connection.refreshExpiresAt = new Date(
        now.getTime() + tokenData.refresh_expires_in * 1000,
      );
      connection.scopes = tokenData.scope?.split(',') || connection.scopes;

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
   * Fetch user info from TikTok
   */
  protected async fetchUserInfo(accessToken: string): Promise<OAuthUserInfo> {
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

    const data = (await response.json()) as TikTokUserInfoResponse;

    if (!data.data?.user) {
      throw new Error('Failed to retrieve user information from TikTok');
    }

    return {
      id: data.data.user.open_id,
      username: data.data.user.display_name,
      displayName: data.data.user.display_name,
      avatarUrl: data.data.user.avatar_url,
      metadata: {
        unionId: data.data.user.union_id,
        avatarUrl: data.data.user.avatar_url,
      },
    };
  }

  /**
   * Get valid access token by TikTok user ID (platform user ID)
   * This maintains backwards compatibility with existing TikTok posting code
   */
  async getValidAccessTokenByTikTokUserId(
    tiktokUserId: string,
  ): Promise<string> {
    let connection = await this.getConnectionByPlatformUserId(tiktokUserId);

    if (!connection) {
      throw new Error(
        'TikTok authentication not found. User needs to authenticate.',
      );
    }

    // Refresh if token is expired or about to expire
    if (connection.needsRefresh()) {
      this.logger.log('Access token expired, refreshing...');
      connection = await this.refreshAccessToken(connection);
    }

    return connection.accessToken;
  }
}
