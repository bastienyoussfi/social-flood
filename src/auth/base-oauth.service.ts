import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SocialConnection } from '../database/entities';
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
    @InjectRepository(SocialConnection)
    protected readonly socialConnectionRepository: Repository<SocialConnection>,
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
  ): Promise<SocialConnection> {
    // Check if connection already exists for this platform user
    let connection = await this.socialConnectionRepository.findOne({
      where: {
        userId,
        platform: this.platform,
        platformUserId: userInfo.id,
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

    const displayName =
      userInfo.displayName || userInfo.username || userInfo.id;

    if (connection) {
      // Update existing connection
      connection.accessToken = tokenResponse.access_token;
      connection.refreshToken =
        tokenResponse.refresh_token || connection.refreshToken;
      connection.expiresAt = expiresAt;
      connection.refreshExpiresAt = refreshExpiresAt;
      connection.scopes = scopes;
      connection.platformUsername = userInfo.username || null;
      connection.displayName = displayName;
      connection.metadata = userInfo.metadata || connection.metadata;
      connection.isActive = true;
    } else {
      // Create new connection
      connection = this.socialConnectionRepository.create({
        userId,
        platform: this.platform,
        displayName,
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

    return await this.socialConnectionRepository.save(connection);
  }

  /**
   * Refresh access token
   * Override for platform-specific refresh logic
   */
  async refreshAccessToken(
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

      const params = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: connection.refreshToken,
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
      connection.accessToken = tokenData.access_token;
      if (tokenData.refresh_token) {
        connection.refreshToken = tokenData.refresh_token;
      }
      connection.expiresAt = tokenData.expires_in
        ? new Date(now.getTime() + tokenData.expires_in * 1000)
        : connection.expiresAt;

      if (tokenData.refresh_expires_in) {
        connection.refreshExpiresAt = new Date(
          now.getTime() + tokenData.refresh_expires_in * 1000,
        );
      }

      if (tokenData.scope) {
        connection.scopes = tokenData.scope.split(/[\s,]+/);
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
   * Get valid access token for a user (refresh if needed)
   * Returns the first active connection for the platform
   */
  async getValidAccessToken(userId: string): Promise<string> {
    let connection = await this.socialConnectionRepository.findOne({
      where: {
        userId,
        platform: this.platform,
        isActive: true,
      },
    });

    if (!connection) {
      throw new Error(
        `${this.platform} authentication not found. User needs to authenticate.`,
      );
    }

    // Refresh if token is expired or about to expire
    if (connection.needsRefresh()) {
      this.logger.log('Access token expired or expiring soon, refreshing...');
      connection = await this.refreshAccessToken(connection);
    }

    return connection.accessToken;
  }

  /**
   * Get connection for a user (first active connection for platform)
   */
  async getConnection(userId: string): Promise<SocialConnection | null> {
    const connection = await this.socialConnectionRepository.findOne({
      where: {
        userId,
        platform: this.platform,
        isActive: true,
      },
    });

    if (!connection) {
      return null;
    }

    // Auto-refresh if expired or expiring soon and refresh token is available
    if (connection.needsRefresh() && connection.refreshToken) {
      this.logger.log(
        `Connection for user ${userId} needs refresh, refreshing...`,
      );
      try {
        return await this.refreshAccessToken(connection);
      } catch (error) {
        this.logger.warn(
          `Failed to refresh connection for user ${userId}: ${getErrorMessage(error)}`,
        );
        // Return the existing connection even if refresh failed
        return connection;
      }
    }

    return connection;
  }

  /**
   * Get all connections for a user on this platform
   */
  async getConnectionsForUser(userId: string): Promise<SocialConnection[]> {
    return this.socialConnectionRepository.find({
      where: {
        userId,
        platform: this.platform,
        isActive: true,
      },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get connection by ID
   */
  async getConnectionById(id: string): Promise<SocialConnection | null> {
    return this.socialConnectionRepository.findOne({
      where: { id, isActive: true },
    });
  }

  /**
   * Get connection by platform user ID
   */
  async getConnectionByPlatformUserId(
    platformUserId: string,
  ): Promise<SocialConnection | null> {
    return this.socialConnectionRepository.findOne({
      where: {
        platformUserId,
        platform: this.platform,
        isActive: true,
      },
    });
  }

  /**
   * Get all connections for this platform (all users)
   */
  async getAllConnections(): Promise<SocialConnection[]> {
    return this.socialConnectionRepository.find({
      where: { platform: this.platform, isActive: true },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Check OAuth connection status
   */
  async getStatus(userId: string): Promise<OAuthStatusResponse> {
    const connection = await this.getConnection(userId);

    const response: OAuthStatusResponse = {
      connected: !!connection && !connection.isExpired(),
      userId,
      platform: this.platform,
    };

    if (connection) {
      response.platformUserId = connection.platformUserId || undefined;
      response.platformUsername = connection.platformUsername || undefined;
      response.scopes = connection.scopes;
      response.expiresAt = connection.expiresAt || undefined;
      response.needsRefresh = connection.needsRefresh();
      response.isExpired = connection.isExpired();
    }

    return response;
  }

  /**
   * Check if user has valid connection
   */
  async hasValidConnection(userId: string): Promise<boolean> {
    const connection = await this.getConnection(userId);
    return connection !== null && !connection.isExpired();
  }

  /**
   * Revoke/deactivate a specific connection by ID
   */
  async revokeConnection(connectionId: string): Promise<void> {
    await this.socialConnectionRepository.update(
      { id: connectionId },
      { isActive: false },
    );
    this.logger.log(`Revoked connection: ${connectionId}`);
  }

  /**
   * Revoke all connections for a user on this platform
   */
  async revokeAllConnections(userId: string): Promise<void> {
    await this.socialConnectionRepository.update(
      { userId, platform: this.platform, isActive: true },
      { isActive: false },
    );
    this.logger.log(
      `Revoked all ${this.platform} connections for user: ${userId}`,
    );
  }

  /**
   * Delete a specific connection by ID
   */
  async deleteConnection(connectionId: string): Promise<void> {
    await this.socialConnectionRepository.delete({ id: connectionId });
    this.logger.log(`Deleted connection: ${connectionId}`);
  }

  /**
   * Delete all connections for a user on this platform
   */
  async deleteAllConnections(userId: string): Promise<void> {
    await this.socialConnectionRepository.delete({
      userId,
      platform: this.platform,
    });
    this.logger.log(
      `Deleted all ${this.platform} connections for user: ${userId}`,
    );
  }
}
