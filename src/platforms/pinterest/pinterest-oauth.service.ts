import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OAuthToken } from '../../database/entities/oauth-token.entity';
import { PinterestConfig, PinterestAuthToken } from './interfaces';
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
  private readonly authorizationBaseUrl = 'https://www.pinterest.com/oauth';
  private readonly tokenUrl = 'https://api.pinterest.com/v5/oauth/token';

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
    const boardId = this.configService.get<string>('PINTEREST_BOARD_ID');

    return {
      appId,
      appSecret,
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

    const authUrl = `${this.authorizationBaseUrl}/?${params.toString()}`;

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

      this.logger.log(
        `Successfully obtained and saved token for user ${userId}`,
      );
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
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.redirectUri,
    });

    return this.sendTokenRequest(params);
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
      const params = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: existingToken.refreshToken,
      });

      const tokenData = await this.sendTokenRequest(params);

      // Update token in database
      const updatedToken = await this.saveToken(userId, tokenData);

      this.logger.log(`Successfully refreshed token for user ${userId}`);
      return updatedToken;
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      const errorStack = getErrorStack(error);

      this.logger.error(`Failed to refresh token: ${errorMessage}`, errorStack);
      throw new Error(`Token refresh failed: ${errorMessage}`);
    }
  }

  /**
   * Execute a Pinterest token request and ensure we get JSON back
   */
  private async sendTokenRequest(
    params: URLSearchParams,
  ): Promise<PinterestAuthToken> {
    const authHeader = Buffer.from(
      `${this.config.appId}:${this.config.appSecret}`,
    ).toString('base64');

    const response = await fetch(this.tokenUrl, {
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
      return JSON.parse(rawBody) as PinterestAuthToken;
    } catch (parseError) {
      this.logger.error(
        'Pinterest token endpoint returned non-JSON response : ' + parseError,
        rawBody.substring(0, 200),
      );
      throw new Error(
        'Pinterest token endpoint returned invalid JSON. Check your redirect URI and app credentials.',
      );
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
      oauthToken.refreshToken =
        tokenData.refresh_token || oauthToken.refreshToken;
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
      const errorMessage = getErrorMessage(error);
      const errorStack = getErrorStack(error);

      this.logger.error(
        `Failed to validate state parameter: ${errorMessage}`,
        errorStack,
      );
      throw new Error(`Failed to validate state parameter: ${errorMessage}`);
    }
  }
}
