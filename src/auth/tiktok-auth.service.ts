import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TikTokAuth } from '../database/entities';
import { getErrorMessage, getErrorStack } from '../common/utils/error.utils';

interface TikTokTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  refresh_expires_in: number;
  open_id: string;
  scope: string;
  token_type: string;
}

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
 * TikTok Authentication Service
 * Handles OAuth 2.0 flow, token management, and refresh
 */
@Injectable()
export class TikTokAuthService {
  private readonly logger = new Logger(TikTokAuthService.name);
  private readonly clientKey: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly tokenUrl = 'https://open.tiktokapis.com/v2/oauth/token/';
  private readonly userInfoUrl =
    'https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name';

  constructor(
    @InjectRepository(TikTokAuth)
    private readonly tiktokAuthRepository: Repository<TikTokAuth>,
    private readonly configService: ConfigService,
  ) {
    this.clientKey = this.configService.get<string>('TIKTOK_CLIENT_KEY') || '';
    this.clientSecret =
      this.configService.get<string>('TIKTOK_CLIENT_SECRET') || '';
    this.redirectUri =
      this.configService.get<string>('TIKTOK_REDIRECT_URI') ||
      'http://localhost:3000/api/auth/tiktok/callback';

    if (!this.clientKey || !this.clientSecret) {
      this.logger.warn(
        'TikTok OAuth credentials not configured. Authentication will not work.',
      );
    }
  }

  /**
   * Generate authorization URL for user to authenticate
   * @param state - Random state string for CSRF protection
   * @returns Authorization URL
   */
  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_key: this.clientKey,
      scope: 'user.info.basic,video.upload,video.publish',
      response_type: 'code',
      redirect_uri: this.redirectUri,
      state,
    });

    return `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   * @param code - Authorization code from callback
   * @returns TikTokAuth entity with tokens
   */
  async exchangeCodeForToken(code: string): Promise<TikTokAuth> {
    try {
      this.logger.log('Exchanging authorization code for access token');

      // Exchange code for tokens
      const tokenResponse = await this.fetchTokens(code);

      // Get user info
      const userInfo = await this.fetchUserInfo(tokenResponse.access_token);

      if (!userInfo.data?.user) {
        throw new Error('Failed to retrieve user information from TikTok');
      }

      const tiktokUserId = userInfo.data.user.open_id;
      const tiktokUsername = userInfo.data.user.display_name;

      // Calculate expiry dates
      const now = new Date();
      const expiresAt = new Date(
        now.getTime() + tokenResponse.expires_in * 1000,
      );
      const refreshExpiresAt = new Date(
        now.getTime() + tokenResponse.refresh_expires_in * 1000,
      );

      // Check if user already exists
      let tiktokAuth = await this.tiktokAuthRepository.findOne({
        where: { tiktokUserId },
      });

      if (tiktokAuth) {
        // Update existing auth
        tiktokAuth.accessToken = tokenResponse.access_token;
        tiktokAuth.refreshToken = tokenResponse.refresh_token;
        tiktokAuth.expiresAt = expiresAt;
        tiktokAuth.refreshExpiresAt = refreshExpiresAt;
        tiktokAuth.tiktokUsername = tiktokUsername;
        tiktokAuth.scopes = tokenResponse.scope.split(',');
      } else {
        // Create new auth
        tiktokAuth = this.tiktokAuthRepository.create({
          tiktokUserId,
          tiktokUsername,
          accessToken: tokenResponse.access_token,
          refreshToken: tokenResponse.refresh_token,
          expiresAt,
          refreshExpiresAt,
          scopes: tokenResponse.scope.split(','),
        });
      }

      await this.tiktokAuthRepository.save(tiktokAuth);

      this.logger.log(
        `Successfully authenticated TikTok user: ${tiktokUsername} (${tiktokUserId})`,
      );

      return tiktokAuth;
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
   * Refresh access token using refresh token
   * @param tiktokAuth - TikTokAuth entity with refresh token
   * @returns Updated TikTokAuth entity
   */
  async refreshAccessToken(tiktokAuth: TikTokAuth): Promise<TikTokAuth> {
    try {
      this.logger.log(
        `Refreshing access token for user: ${tiktokAuth.tiktokUserId}`,
      );

      if (tiktokAuth.isRefreshTokenExpired()) {
        throw new Error(
          'Refresh token expired. User needs to re-authenticate.',
        );
      }

      const response = await fetch(this.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_key: this.clientKey,
          client_secret: this.clientSecret,
          grant_type: 'refresh_token',
          refresh_token: tiktokAuth.refreshToken,
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
      tiktokAuth.accessToken = tokenData.access_token;
      tiktokAuth.refreshToken = tokenData.refresh_token;
      tiktokAuth.expiresAt = new Date(
        now.getTime() + tokenData.expires_in * 1000,
      );
      tiktokAuth.refreshExpiresAt = new Date(
        now.getTime() + tokenData.refresh_expires_in * 1000,
      );
      tiktokAuth.scopes = tokenData.scope.split(',');

      await this.tiktokAuthRepository.save(tiktokAuth);

      this.logger.log('Access token refreshed successfully');

      return tiktokAuth;
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
   * Get valid access token for a TikTok user (refresh if needed)
   * @param tiktokUserId - TikTok user ID
   * @returns Valid access token
   */
  async getValidAccessToken(tiktokUserId: string): Promise<string> {
    let tiktokAuth = await this.tiktokAuthRepository.findOne({
      where: { tiktokUserId },
    });

    if (!tiktokAuth) {
      throw new Error(
        'TikTok authentication not found. User needs to authenticate.',
      );
    }

    // Refresh if token is expired or about to expire
    if (tiktokAuth.isAccessTokenExpired()) {
      this.logger.log('Access token expired, refreshing...');
      tiktokAuth = await this.refreshAccessToken(tiktokAuth);
    }

    return tiktokAuth.accessToken;
  }

  /**
   * Get TikTok auth by user ID
   * @param tiktokUserId - TikTok user ID
   * @returns TikTokAuth entity or null
   */
  async getAuthByUserId(tiktokUserId: string): Promise<TikTokAuth | null> {
    return this.tiktokAuthRepository.findOne({
      where: { tiktokUserId },
    });
  }

  /**
   * Get all authenticated TikTok users
   * @returns Array of TikTokAuth entities
   */
  async getAllAuthenticatedUsers(): Promise<TikTokAuth[]> {
    return this.tiktokAuthRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Delete TikTok authentication
   * @param tiktokUserId - TikTok user ID
   */
  async deleteAuth(tiktokUserId: string): Promise<void> {
    await this.tiktokAuthRepository.delete({ tiktokUserId });
    this.logger.log(`Deleted TikTok auth for user: ${tiktokUserId}`);
  }

  /**
   * Fetch tokens from TikTok
   * @param code - Authorization code
   * @returns Token response
   */
  private async fetchTokens(code: string): Promise<TikTokTokenResponse> {
    const response = await fetch(this.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_key: this.clientKey,
        client_secret: this.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: this.redirectUri,
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
   * Fetch user info from TikTok
   * @param accessToken - Access token
   * @returns User info response
   */
  private async fetchUserInfo(
    accessToken: string,
  ): Promise<TikTokUserInfoResponse> {
    const response = await fetch(this.userInfoUrl, {
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

    return (await response.json()) as TikTokUserInfoResponse;
  }
}
