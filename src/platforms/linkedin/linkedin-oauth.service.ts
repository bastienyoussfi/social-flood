import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OAuthToken } from '../../database/entities/oauth-token.entity';
import { LinkedInConfig, LinkedInAuthToken } from './interfaces';
import { getErrorMessage, getErrorStack } from '../../common/utils/error.utils';

/**
 * LinkedIn user info response from userinfo endpoint
 */
interface LinkedInUserInfo {
  sub: string; // This is the person URN ID
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  email?: string;
  email_verified?: boolean;
}

/**
 * LinkedIn OAuth Service
 * Handles OAuth 2.0 authentication flow for LinkedIn
 * - Authorization URL generation
 * - Token exchange
 * - Token refresh
 * - Token storage and retrieval
 */
@Injectable()
export class LinkedInOAuthService {
  private readonly logger = new Logger(LinkedInOAuthService.name);
  private readonly config: LinkedInConfig;
  private readonly redirectUri: string;
  private readonly authorizationUrl =
    'https://www.linkedin.com/oauth/v2/authorization';
  private readonly tokenUrl = 'https://www.linkedin.com/oauth/v2/accessToken';
  private readonly userInfoUrl = 'https://api.linkedin.com/v2/userinfo';

  // LinkedIn OAuth scopes
  // See: https://learn.microsoft.com/en-us/linkedin/shared/authentication/authentication
  private readonly defaultScopes = ['openid', 'profile', 'w_member_social'];

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(OAuthToken)
    private readonly oauthTokenRepository: Repository<OAuthToken>,
  ) {
    this.config = this.loadConfig();
    this.redirectUri =
      this.configService.get<string>('LINKEDIN_REDIRECT_URI') ||
      'http://localhost:3000/auth/linkedin/callback';
    this.logger.log('LinkedIn OAuth service initialized');
  }

  /**
   * Load LinkedIn configuration from environment
   */
  private loadConfig(): LinkedInConfig {
    const clientId = this.configService.get<string>('LINKEDIN_CLIENT_ID') || '';
    const clientSecret =
      this.configService.get<string>('LINKEDIN_CLIENT_SECRET') || '';

    return {
      clientId,
      clientSecret,
    };
  }

  /**
   * Generate LinkedIn OAuth authorization URL
   * User should be redirected to this URL to authorize the app
   *
   * @param userId - Unique identifier for the user
   * @param state - Optional state parameter for CSRF protection
   * @returns Authorization URL
   */
  getAuthorizationUrl(userId: string, state?: string): string {
    if (!this.config.clientId) {
      throw new Error('LinkedIn Client ID is not configured');
    }

    const stateParam = state || this.generateState(userId);
    const scopes = this.defaultScopes.join(' ');

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientId,
      redirect_uri: this.redirectUri,
      scope: scopes,
      state: stateParam,
    });

    const authUrl = `${this.authorizationUrl}?${params.toString()}`;

    this.logger.log(`Generated authorization URL for user ${userId}`);
    return authUrl;
  }

  /**
   * Exchange authorization code for access token
   * Called after user authorizes the app and LinkedIn redirects back
   *
   * @param code - Authorization code from LinkedIn
   * @param userId - User identifier
   * @returns Stored OAuth token
   */
  async exchangeCodeForToken(
    code: string,
    userId: string,
  ): Promise<OAuthToken> {
    try {
      this.logger.log(`Exchanging authorization code for user ${userId}`);

      if (!this.config.clientId || !this.config.clientSecret) {
        throw new Error('LinkedIn Client ID and Client Secret are required');
      }

      // Exchange code for token
      const tokenResponse = await this.requestAccessToken(code);

      // Get user info to retrieve person URN
      const userInfo = await this.fetchUserInfo(tokenResponse.access_token);

      // Save token to database
      const oauthToken = await this.saveToken(userId, tokenResponse, userInfo);

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
   * Request access token from LinkedIn
   */
  private async requestAccessToken(code: string): Promise<LinkedInAuthToken> {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.redirectUri,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
    });

    return this.sendTokenRequest(params);
  }

  /**
   * Refresh access token using refresh token
   * Note: LinkedIn OAuth 2.0 tokens typically don't support refresh tokens
   * for 3-legged OAuth. Tokens are valid for 60 days and user must re-authorize.
   *
   * @param userId - User identifier
   * @returns Updated OAuth token
   */
  async refreshToken(userId: string): Promise<OAuthToken> {
    try {
      this.logger.log(`Attempting to refresh token for user ${userId}`);

      // Get existing token
      const existingToken = await this.getToken(userId);
      if (!existingToken) {
        throw new Error('No existing token found');
      }

      if (!existingToken.refreshToken) {
        throw new Error(
          'No refresh token available. LinkedIn tokens typically require re-authorization after expiry.',
        );
      }

      // Request new token
      const params = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: existingToken.refreshToken,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
      });

      const tokenData = await this.sendTokenRequest(params);

      // Get updated user info
      const userInfo = await this.fetchUserInfo(tokenData.access_token);

      // Update token in database
      const updatedToken = await this.saveToken(userId, tokenData, userInfo);

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
   * Execute a LinkedIn token request
   */
  private async sendTokenRequest(
    params: URLSearchParams,
  ): Promise<LinkedInAuthToken> {
    const response = await fetch(this.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const rawBody = await response.text();

    if (!response.ok) {
      this.logger.error(
        `LinkedIn token request failed (${response.status}): ${rawBody}`,
      );
      throw new Error(
        `LinkedIn token request failed: ${response.status} ${rawBody}`,
      );
    }

    try {
      return JSON.parse(rawBody) as LinkedInAuthToken;
    } catch (parseError) {
      this.logger.error(
        'LinkedIn token endpoint returned non-JSON response: ' + parseError,
        rawBody.substring(0, 200),
      );
      throw new Error(
        'LinkedIn token endpoint returned invalid JSON. Check your redirect URI and app credentials.',
      );
    }
  }

  /**
   * Fetch user info from LinkedIn userinfo endpoint
   * @param accessToken - Access token
   * @returns User info including sub (person URN ID)
   */
  private async fetchUserInfo(accessToken: string): Promise<LinkedInUserInfo> {
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

    return (await response.json()) as LinkedInUserInfo;
  }

  /**
   * Save or update OAuth token in database
   */
  private async saveToken(
    userId: string,
    tokenData: LinkedInAuthToken,
    userInfo: LinkedInUserInfo,
  ): Promise<OAuthToken> {
    // Check if token already exists
    let oauthToken = await this.oauthTokenRepository.findOne({
      where: {
        userId,
        platform: 'linkedin',
      },
    });

    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000)
      : null;

    const scopes = tokenData.scope
      ? tokenData.scope.split(' ')
      : this.defaultScopes;

    // Create person URN from sub
    const personUrn = `urn:li:person:${userInfo.sub}`;

    if (oauthToken) {
      // Update existing token
      oauthToken.accessToken = tokenData.access_token;
      oauthToken.refreshToken =
        tokenData.refresh_token || oauthToken.refreshToken;
      oauthToken.expiresAt = expiresAt;
      oauthToken.scopes = scopes;
      oauthToken.platformUserId = userInfo.sub;
      oauthToken.platformUsername = userInfo.name || null;
      oauthToken.metadata = {
        personUrn,
        givenName: userInfo.given_name,
        familyName: userInfo.family_name,
        picture: userInfo.picture,
        email: userInfo.email,
      };
      oauthToken.isActive = true;
    } else {
      // Create new token
      oauthToken = this.oauthTokenRepository.create({
        userId,
        platform: 'linkedin',
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || null,
        expiresAt,
        scopes,
        platformUserId: userInfo.sub,
        platformUsername: userInfo.name || null,
        metadata: {
          personUrn,
          givenName: userInfo.given_name,
          familyName: userInfo.family_name,
          picture: userInfo.picture,
          email: userInfo.email,
        },
        isActive: true,
      });
    }

    return await this.oauthTokenRepository.save(oauthToken);
  }

  /**
   * Get OAuth token for user
   * Automatically attempts refresh if expired (if refresh token available)
   *
   * @param userId - User identifier
   * @returns OAuth token or null if not found
   */
  async getToken(userId: string): Promise<OAuthToken | null> {
    const token = await this.oauthTokenRepository.findOne({
      where: {
        userId,
        platform: 'linkedin',
        isActive: true,
      },
    });

    if (!token) {
      return null;
    }

    // Auto-refresh if expired or expiring soon and refresh token is available
    if (token.needsRefresh() && token.refreshToken) {
      this.logger.log(`Token for user ${userId} needs refresh, refreshing...`);
      try {
        return await this.refreshToken(userId);
      } catch (error) {
        this.logger.warn(
          `Failed to refresh token for user ${userId}: ${getErrorMessage(error)}`,
        );
        // Return the existing token even if refresh failed
        // The caller can decide how to handle the expired token
        return token;
      }
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
   * Get person URN for a user
   *
   * @param userId - User identifier
   * @returns Person URN (e.g., urn:li:person:ABC123) or null
   */
  async getPersonUrn(userId: string): Promise<string | null> {
    const token = await this.getToken(userId);
    if (!token || !token.metadata) {
      return null;
    }
    return (token.metadata as Record<string, string>).personUrn || null;
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
        platform: 'linkedin',
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
      return null;
    }
  }
}
