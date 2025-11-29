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
 * Pinterest OAuth Service
 * Implements OAuth 2.0 flow for Pinterest
 */
@Injectable()
export class PinterestOAuthService extends BaseOAuthService {
  protected readonly platform: OAuthPlatform = 'pinterest';
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
        'Pinterest OAuth credentials not configured. Authentication will not work.',
      );
    }
  }

  private loadConfig(): OAuthConfig {
    return {
      clientId: this.configService.get<string>('PINTEREST_APP_ID') || '',
      clientSecret:
        this.configService.get<string>('PINTEREST_APP_SECRET') || '',
      redirectUri:
        this.configService.get<string>('PINTEREST_REDIRECT_URI') ||
        'http://localhost:3000/api/oauth/pinterest/callback',
      scopes: [
        'boards:read',
        'boards:write',
        'pins:read',
        'pins:write',
        'user_accounts:read',
      ],
      authorizationUrl: 'https://www.pinterest.com/oauth',
      tokenUrl: 'https://api.pinterest.com/v5/oauth/token',
      userInfoUrl: 'https://api.pinterest.com/v5/user_account',
    };
  }

  /**
   * Generate authorization URL (Pinterest uses comma-separated scopes)
   */
  override getAuthorizationUrl(userId: string): { url: string; state: string } {
    if (!this.isConfigured()) {
      throw new Error(
        'Pinterest OAuth is not configured. Please set PINTEREST_APP_ID and PINTEREST_APP_SECRET.',
      );
    }

    const state = this.stateManager.generateState(userId, this.platform);

    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      scope: this.config.scopes.join(','),
      state,
    });

    const url = `${this.config.authorizationUrl}/?${params.toString()}`;

    this.logger.log(`Generated Pinterest authorization URL for user ${userId}`);

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
      const tokenResponse = await this.fetchPinterestTokens(code);

      // Pinterest token response may not include user info, so we fetch it separately
      const userInfo = await this.fetchUserInfo(tokenResponse.access_token);

      // Save connection
      const connection = await this.saveToken(userId, tokenResponse, userInfo);

      this.logger.log(
        `Successfully authenticated Pinterest user: ${userInfo.username} (${userInfo.id})`,
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
      throw new Error(`Pinterest authentication failed: ${errorMessage}`);
    }
  }

  /**
   * Fetch tokens from Pinterest (uses Basic auth)
   */
  private async fetchPinterestTokens(
    code: string,
  ): Promise<OAuthTokenResponse> {
    const authHeader = Buffer.from(
      `${this.config.clientId}:${this.config.clientSecret}`,
    ).toString('base64');

    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.config.redirectUri,
    });

    const response = await fetch(this.config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        Authorization: `Basic ${authHeader}`,
      },
      body: params.toString(),
    });

    const rawBody = await response.text();

    if (!response.ok) {
      this.logger.error(
        `Pinterest token request failed (${response.status}): ${rawBody}`,
      );
      throw new Error(
        `Pinterest token request failed: ${response.status} ${rawBody}`,
      );
    }

    try {
      return JSON.parse(rawBody) as OAuthTokenResponse;
    } catch (parseError) {
      this.logger.error(
        'Pinterest token endpoint returned non-JSON response: ' + parseError,
        rawBody.substring(0, 200),
      );
      throw new Error(
        'Pinterest token endpoint returned invalid JSON. Check your redirect URI and app credentials.',
      );
    }
  }

  /**
   * Refresh access token (Pinterest uses Basic auth)
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

      const authHeader = Buffer.from(
        `${this.config.clientId}:${this.config.clientSecret}`,
      ).toString('base64');

      const params = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: connection.refreshToken,
      });

      const response = await fetch(this.config.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
          Authorization: `Basic ${authHeader}`,
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

      // Update tokens
      const now = new Date();
      connection.accessToken = tokenData.access_token;
      if (tokenData.refresh_token) {
        connection.refreshToken = tokenData.refresh_token;
      }
      connection.expiresAt = tokenData.expires_in
        ? new Date(now.getTime() + tokenData.expires_in * 1000)
        : connection.expiresAt;

      if (tokenData.scope) {
        connection.scopes = tokenData.scope.split(',');
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
   * Fetch user info from Pinterest
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

    const data = (await response.json()) as {
      id?: string;
      username?: string;
      business_name?: string;
      profile_image?: string;
      website_url?: string;
    };

    return {
      id: data.id || 'unknown',
      username: data.username,
      displayName: data.business_name || data.username,
      avatarUrl: data.profile_image,
      metadata: {
        businessName: data.business_name,
        profileImage: data.profile_image,
        websiteUrl: data.website_url,
      },
    };
  }

  /**
   * Get access token for API calls (convenience method)
   */
  async getAccessToken(userId: string): Promise<string | null> {
    const connection = await this.getConnection(userId);
    return connection?.accessToken || null;
  }
}
