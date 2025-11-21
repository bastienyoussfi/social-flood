import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OAuthToken } from '../../database/entities/oauth-token.entity';
import {
  PinterestConfig,
  PinterestAuthToken,
  PINTEREST_API_BASE_URL,
} from './interfaces';
import { getErrorMessage, getErrorStack } from '../../common/utils/error.utils';

/**
 * Pinterest OAuth Service
 * Handles OAuth 2.0 authentication flow for Pinterest
 * - Authorization URL generation
 * - Token exchange
 * - Token refresh
 * - Token storage and retrieval
 */
@Injectable()
export class PinterestOAuthService {
  private readonly logger = new Logger(PinterestOAuthService.name);
  private readonly config: PinterestConfig;
  private readonly redirectUri: string;
  private readonly authBaseUrl = 'https://www.pinterest.com/oauth';

  // Pinterest OAuth scopes
  // See: https://developers.pinterest.com/docs/getting-started/scopes/
  private readonly defaultScopes = [
    'boards:read',
    'boards:write',
    'pins:read',
    'pins:write',
    'user_accounts:read',
  ];

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(OAuthToken)
    private readonly oauthTokenRepository: Repository<OAuthToken>,
  ) {
    this.config = this.loadConfig();
    this.redirectUri =
      this.configService.get<string>('PINTEREST_REDIRECT_URI') ||
      'http://localhost:3000/auth/pinterest/callback';
    this.logger.log('Pinterest OAuth service initialized');
  }

  /**
   * Load Pinterest configuration from environment
   */
  private loadConfig(): PinterestConfig {
    const appId = this.configService.get<string>('PINTEREST_APP_ID') || '';
    const appSecret =
      this.configService.get<string>('PINTEREST_APP_SECRET') || '';
    const accessToken =
      this.configService.get<string>('PINTEREST_ACCESS_TOKEN') || '';
    const boardId = this.configService.get<string>('PINTEREST_BOARD_ID');

    return {
      appId,
      appSecret,
      accessToken,
      boardId,
    };
  }

  /**
   * Generate Pinterest OAuth authorization URL
   * User should be redirected to this URL to authorize the app
   *
   * @param userId - Unique identifier for the user
   * @param state - Optional state parameter for CSRF protection
   * @returns Authorization URL
   */
  getAuthorizationUrl(userId: string, state?: string): string {
    if (!this.config.appId) {
      throw new Error('Pinterest App ID is not configured');
    }

    const stateParam = state || this.generateState(userId);
    const scopes = this.defaultScopes.join(',');

    const params = new URLSearchParams({
      client_id: this.config.appId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: scopes,
      state: stateParam,
    });

    const authUrl = `${this.authBaseUrl}/?${params.toString()}`;

    this.logger.log(`Generated authorization URL for user ${userId}`);
    return authUrl;
  }

  /**
   * Exchange authorization code for access token
   * Called after user authorizes the app and Pinterest redirects back
   *
   * @param code - Authorization code from Pinterest
   * @param userId - User identifier
   * @returns Stored OAuth token
   */
  async exchangeCodeForToken(
    code: string,
    userId: string,
  ): Promise<OAuthToken> {
    try {
      this.logger.log(`Exchanging authorization code for user ${userId}`);

      if (!this.config.appId || !this.config.appSecret) {
        throw new Error('Pinterest App ID and App Secret are required');
      }

      // Exchange code for token
      const tokenResponse = await this.requestAccessToken(code);

      // Save token to database
      const oauthToken = await this.saveToken(userId, tokenResponse);

      this.logger.log(`Successfully obtained and saved token for user ${userId}`);
      return oauthToken;
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      const errorStack = getErrorStack(error);

      this.logger.error(
        `Failed to exchange code for token: ${errorMessage}`,
        errorStack,
      );
      throw new Error(`OAuth token exchange failed: ${errorMessage}`);
    }
  }

  /**
   * Request access token from Pinterest
   */
  private async requestAccessToken(code: string): Promise<PinterestAuthToken> {
    const tokenUrl = `${this.authBaseUrl}/token`;

    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: this.redirectUri,
    });

    const authHeader = Buffer.from(
      `${this.config.appId}:${this.config.appSecret}`,
    ).toString('base64');

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${authHeader}`,
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error(`Pinterest token request failed: ${errorText}`);
      throw new Error(
        `Pinterest token request failed: ${response.status} ${errorText}`,
      );
    }

    const tokenData: PinterestAuthToken = await response.json();
    return tokenData;
  }

  /**
   * Refresh access token using refresh token
   *
   * @param userId - User identifier
   * @returns Updated OAuth token
   */
  async refreshToken(userId: string): Promise<OAuthToken> {
    try {
      this.logger.log(`Refreshing token for user ${userId}`);

      // Get existing token
      const existingToken = await this.getToken(userId);
      if (!existingToken) {
        throw new Error('No existing token found');
      }

      if (!existingToken.refreshToken) {
        throw new Error('No refresh token available');
      }

      // Request new token
      const tokenUrl = `${this.authBaseUrl}/token`;

      const params = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: existingToken.refreshToken,
      });

      const authHeader = Buffer.from(
        `${this.config.appId}:${this.config.appSecret}`,
      ).toString('base64');

      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${authHeader}`,
        },
        body: params.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Token refresh failed: ${response.status} ${errorText}`);
      }

      const tokenData: PinterestAuthToken = await response.json();

      // Update token in database
      const updatedToken = await this.saveToken(userId, tokenData);

      this.logger.log(`Successfully refreshed token for user ${userId}`);
      return updatedToken;
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      const errorStack = getErrorStack(error);

      this.logger.error(
        `Failed to refresh token: ${errorMessage}`,
        errorStack,
      );
      throw new Error(`Token refresh failed: ${errorMessage}`);
    }
  }

  /**
   * Save or update OAuth token in database
   */
  private async saveToken(
    userId: string,
    tokenData: PinterestAuthToken,
  ): Promise<OAuthToken> {
    // Check if token already exists
    let oauthToken = await this.oauthTokenRepository.findOne({
      where: {
        userId,
        platform: 'pinterest',
      },
    });

    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000)
      : null;

    const scopes = tokenData.scope ? tokenData.scope.split(',') : [];

    if (oauthToken) {
      // Update existing token
      oauthToken.accessToken = tokenData.access_token;
      oauthToken.refreshToken = tokenData.refresh_token || oauthToken.refreshToken;
      oauthToken.expiresAt = expiresAt;
      oauthToken.scopes = scopes;
      oauthToken.isActive = true;
    } else {
      // Create new token
      oauthToken = this.oauthTokenRepository.create({
        userId,
        platform: 'pinterest',
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || null,
        expiresAt,
        scopes,
        isActive: true,
      });
    }

    return await this.oauthTokenRepository.save(oauthToken);
  }

  /**
   * Get OAuth token for user
   * Automatically refreshes if expired
   *
   * @param userId - User identifier
   * @returns OAuth token or null if not found
   */
  async getToken(userId: string): Promise<OAuthToken | null> {
    const token = await this.oauthTokenRepository.findOne({
      where: {
        userId,
        platform: 'pinterest',
        isActive: true,
      },
    });

    if (!token) {
      return null;
    }

    // Auto-refresh if expired or expiring soon
    if (token.needsRefresh() && token.refreshToken) {
      this.logger.log(`Token for user ${userId} needs refresh, refreshing...`);
      return await this.refreshToken(userId);
    }

    return token;
  }

  /**
   * Get access token string for API calls
   *
   * @param userId - User identifier
   * @returns Access token string or null
   */
  async getAccessToken(userId: string): Promise<string | null> {
    const token = await this.getToken(userId);
    return token?.accessToken || null;
  }

  /**
   * Revoke OAuth token (deactivate)
   *
   * @param userId - User identifier
   */
  async revokeToken(userId: string): Promise<void> {
    const token = await this.oauthTokenRepository.findOne({
      where: {
        userId,
        platform: 'pinterest',
        isActive: true,
      },
    });

    if (token) {
      token.isActive = false;
      await this.oauthTokenRepository.save(token);
      this.logger.log(`Revoked token for user ${userId}`);
    }
  }

  /**
   * Check if user has valid OAuth token
   *
   * @param userId - User identifier
   * @returns True if valid token exists
   */
  async hasValidToken(userId: string): Promise<boolean> {
    const token = await this.getToken(userId);
    return token !== null && !token.isExpired();
  }

  /**
   * Generate state parameter for CSRF protection
   */
  private generateState(userId: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    return Buffer.from(`${userId}:${timestamp}:${random}`).toString('base64');
  }

  /**
   * Validate and parse state parameter
   */
  validateState(state: string): { userId: string; timestamp: number } | null {
    try {
      const decoded = Buffer.from(state, 'base64').toString('utf-8');
      const [userId, timestamp] = decoded.split(':');

      // Check if state is not too old (5 minutes)
      const age = Date.now() - parseInt(timestamp, 10);
      if (age > 5 * 60 * 1000) {
        this.logger.warn('State parameter is too old');
        return null;
      }

      return { userId, timestamp: parseInt(timestamp, 10) };
    } catch (error) {
      this.logger.error('Failed to validate state parameter');
      return null;
    }
  }
}
