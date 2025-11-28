import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OAuthToken } from '../database/entities';
import { OAuthStateManager } from './utils/state-manager';
import {
  OAuthPlatform,
  OAuthConfig,
  OAuthTokenResponse,
  OAuthUserInfo,
  OAuthInitResult,
  OAuthCallbackResult,
  OAuthStatusResponse,
} from './interfaces';
import { getErrorMessage, getErrorStack } from '../common/utils/error.utils';

/**
 * Base OAuth Service
 * Provides common OAuth 2.0 functionality for all platforms
 * Platform-specific services extend this class and override necessary methods
 */
@Injectable()
export abstract class BaseOAuthService {
  protected readonly logger: Logger;
  protected abstract readonly platform: OAuthPlatform;
  protected abstract readonly config: OAuthConfig;

  constructor(
    @InjectRepository(OAuthToken)
    protected readonly oauthTokenRepository: Repository<OAuthToken>,
    protected readonly stateManager: OAuthStateManager,
  ) {
    this.logger = new Logger(this.constructor.name);
  }

  /**
   * Check if the service is properly configured
   */
  isConfigured(): boolean {
    return !!(this.config.clientId && this.config.clientSecret);
  }

  /**
   * Generate authorization URL for OAuth flow
   * Override in subclass if PKCE or custom params needed
   */
  getAuthorizationUrl(userId: string): OAuthInitResult {
    if (!this.isConfigured()) {
      throw new Error(
        `${this.platform} OAuth is not configured. Please set required credentials.`,
      );
    }

    const state = this.stateManager.generateState(userId, this.platform);

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: this.config.scopes.join(' '),
      state,
    });

    const url = `${this.config.authorizationUrl}?${params.toString()}`;

    this.logger.log(`Generated authorization URL for user ${userId}`);

    return { url, state };
  }

  /**
   * Exchange authorization code for tokens
   * Must be implemented by each platform
   */
  abstract exchangeCodeForToken(
    code: string,
    state: string,
  ): Promise<OAuthCallbackResult>;

  /**
   * Fetch tokens from the OAuth provider
   * Override for custom authentication (e.g., Basic auth header)
   */
  protected async fetchTokens(
    code: string,
    codeVerifier?: string,
  ): Promise<OAuthTokenResponse> {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.config.redirectUri,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
    });

    if (codeVerifier) {
      params.set('code_verifier', codeVerifier);
    }

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
   * Fetch user info from the platform
   * Override for platform-specific user info endpoints
   */
  protected abstract fetchUserInfo(accessToken: string): Promise<OAuthUserInfo>;

  /**
   * Save or update OAuth token in database
   */
  protected async saveToken(
    userId: string,
    tokenResponse: OAuthTokenResponse,
    userInfo: OAuthUserInfo,
    refreshExpiresIn?: number,
  ): Promise<OAuthToken> {
    // Check if token already exists
    let oauthToken = await this.oauthTokenRepository.findOne({
      where: {
        userId,
        platform: this.platform,
      },
    });

    const now = new Date();
    const expiresAt = tokenResponse.expires_in
      ? new Date(now.getTime() + tokenResponse.expires_in * 1000)
      : null;

    const refreshExpiresAt = refreshExpiresIn
      ? new Date(now.getTime() + refreshExpiresIn * 1000)
      : null;

    const scopes = tokenResponse.scope
      ? tokenResponse.scope.split(/[\s,]+/)
      : this.config.scopes;

    if (oauthToken) {
      // Update existing token
      oauthToken.accessToken = tokenResponse.access_token;
      oauthToken.refreshToken =
        tokenResponse.refresh_token || oauthToken.refreshToken;
      oauthToken.expiresAt = expiresAt;
      oauthToken.refreshExpiresAt = refreshExpiresAt;
      oauthToken.scopes = scopes;
      oauthToken.platformUserId = userInfo.id;
      oauthToken.platformUsername = userInfo.username || null;
      oauthToken.metadata = userInfo.metadata || oauthToken.metadata;
      oauthToken.isActive = true;
    } else {
      // Create new token
      oauthToken = this.oauthTokenRepository.create({
        userId,
        platform: this.platform,
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token || null,
        expiresAt,
        refreshExpiresAt,
        scopes,
        platformUserId: userInfo.id,
        platformUsername: userInfo.username || null,
        metadata: userInfo.metadata || null,
        isActive: true,
      });
    }

    return await this.oauthTokenRepository.save(oauthToken);
  }

  /**
   * Refresh access token
   * Override for platform-specific refresh logic
   */
  async refreshAccessToken(oauthToken: OAuthToken): Promise<OAuthToken> {
    try {
      this.logger.log(`Refreshing access token for user: ${oauthToken.userId}`);

      if (!oauthToken.refreshToken) {
        throw new Error(
          'No refresh token available. User needs to re-authenticate.',
        );
      }

      if (oauthToken.isRefreshTokenExpired()) {
        throw new Error(
          'Refresh token expired. User needs to re-authenticate.',
        );
      }

      const params = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: oauthToken.refreshToken,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
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

      // Update tokens
      const now = new Date();
      oauthToken.accessToken = tokenData.access_token;
      if (tokenData.refresh_token) {
        oauthToken.refreshToken = tokenData.refresh_token;
      }
      oauthToken.expiresAt = tokenData.expires_in
        ? new Date(now.getTime() + tokenData.expires_in * 1000)
        : oauthToken.expiresAt;

      if (tokenData.refresh_expires_in) {
        oauthToken.refreshExpiresAt = new Date(
          now.getTime() + tokenData.refresh_expires_in * 1000,
        );
      }

      if (tokenData.scope) {
        oauthToken.scopes = tokenData.scope.split(/[\s,]+/);
      }

      await this.oauthTokenRepository.save(oauthToken);

      this.logger.log('Access token refreshed successfully');

      return oauthToken;
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
   * Get valid access token for a user (refresh if needed)
   */
  async getValidAccessToken(userId: string): Promise<string> {
    let oauthToken = await this.oauthTokenRepository.findOne({
      where: {
        userId,
        platform: this.platform,
        isActive: true,
      },
    });

    if (!oauthToken) {
      throw new Error(
        `${this.platform} authentication not found. User needs to authenticate.`,
      );
    }

    // Refresh if token is expired or about to expire
    if (oauthToken.needsRefresh()) {
      this.logger.log('Access token expired or expiring soon, refreshing...');
      oauthToken = await this.refreshAccessToken(oauthToken);
    }

    return oauthToken.accessToken;
  }

  /**
   * Get OAuth token for a user
   */
  async getToken(userId: string): Promise<OAuthToken | null> {
    const token = await this.oauthTokenRepository.findOne({
      where: {
        userId,
        platform: this.platform,
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
        return await this.refreshAccessToken(token);
      } catch (error) {
        this.logger.warn(
          `Failed to refresh token for user ${userId}: ${getErrorMessage(error)}`,
        );
        // Return the existing token even if refresh failed
        return token;
      }
    }

    return token;
  }

  /**
   * Get OAuth token by platform user ID
   */
  async getTokenByPlatformUserId(
    platformUserId: string,
  ): Promise<OAuthToken | null> {
    return this.oauthTokenRepository.findOne({
      where: {
        platformUserId,
        platform: this.platform,
        isActive: true,
      },
    });
  }

  /**
   * Get all authenticated users for this platform
   */
  async getAllAuthenticatedUsers(): Promise<OAuthToken[]> {
    return this.oauthTokenRepository.find({
      where: { platform: this.platform, isActive: true },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Check OAuth connection status
   */
  async getStatus(userId: string): Promise<OAuthStatusResponse> {
    const token = await this.getToken(userId);

    const response: OAuthStatusResponse = {
      connected: !!token && !token.isExpired(),
      userId,
      platform: this.platform,
    };

    if (token) {
      response.platformUserId = token.platformUserId || undefined;
      response.platformUsername = token.platformUsername || undefined;
      response.scopes = token.scopes;
      response.expiresAt = token.expiresAt || undefined;
      response.needsRefresh = token.needsRefresh();
      response.isExpired = token.isExpired();
    }

    return response;
  }

  /**
   * Check if user has valid OAuth token
   */
  async hasValidToken(userId: string): Promise<boolean> {
    const token = await this.getToken(userId);
    return token !== null && !token.isExpired();
  }

  /**
   * Revoke/deactivate OAuth token
   */
  async revokeToken(userId: string): Promise<void> {
    await this.oauthTokenRepository.update(
      { userId, platform: this.platform, isActive: true },
      { isActive: false },
    );
    this.logger.log(`Revoked ${this.platform} auth for user: ${userId}`);
  }

  /**
   * Delete OAuth token completely
   */
  async deleteToken(userId: string): Promise<void> {
    await this.oauthTokenRepository.delete({
      userId,
      platform: this.platform,
    });
    this.logger.log(`Deleted ${this.platform} auth for user: ${userId}`);
  }
}
