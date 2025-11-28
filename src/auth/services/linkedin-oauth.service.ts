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
 * Implements OAuth 2.0 flow for LinkedIn
 */
@Injectable()
export class LinkedInOAuthService extends BaseOAuthService {
  protected readonly platform: OAuthPlatform = 'linkedin';
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
        'LinkedIn OAuth credentials not configured. Authentication will not work.',
      );
    }
  }

  private loadConfig(): OAuthConfig {
    return {
      clientId: this.configService.get<string>('LINKEDIN_CLIENT_ID') || '',
      clientSecret:
        this.configService.get<string>('LINKEDIN_CLIENT_SECRET') || '',
      redirectUri:
        this.configService.get<string>('LINKEDIN_REDIRECT_URI') ||
        'http://localhost:3000/api/auth/linkedin/callback',
      scopes: ['openid', 'profile', 'w_member_social'],
      authorizationUrl: 'https://www.linkedin.com/oauth/v2/authorization',
      tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
      userInfoUrl: 'https://api.linkedin.com/v2/userinfo',
    };
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
      const tokenResponse = await this.fetchLinkedInTokens(code);

      // Get user info
      const userInfo = await this.fetchUserInfo(tokenResponse.access_token);

      // Save connection
      const connection = await this.saveToken(userId, tokenResponse, userInfo);

      this.logger.log(
        `Successfully authenticated LinkedIn user: ${userInfo.displayName} (${userInfo.id})`,
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
      throw new Error(`LinkedIn authentication failed: ${errorMessage}`);
    }
  }

  /**
   * Fetch tokens from LinkedIn
   */
  private async fetchLinkedInTokens(code: string): Promise<OAuthTokenResponse> {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.config.redirectUri,
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
      return JSON.parse(rawBody) as OAuthTokenResponse;
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
   * Refresh access token
   * Note: LinkedIn OAuth 2.0 tokens typically don't support refresh tokens
   * for 3-legged OAuth. Tokens are valid for 60 days and user must re-authorize.
   */
  override async refreshAccessToken(
    connection: SocialConnection,
  ): Promise<SocialConnection> {
    try {
      this.logger.log(`Refreshing access token for user: ${connection.userId}`);

      if (!connection.refreshToken) {
        throw new Error(
          'No refresh token available. LinkedIn tokens typically require re-authorization after expiry.',
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

      // Get updated user info
      const userInfo = await this.fetchUserInfo(tokenData.access_token);

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
        connection.scopes = tokenData.scope.split(' ');
      }

      // Update user info
      connection.platformUserId = userInfo.id;
      connection.platformUsername = userInfo.displayName || null;
      connection.metadata = userInfo.metadata || null;

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
   * Fetch user info from LinkedIn
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

    const data = (await response.json()) as LinkedInUserInfo;

    // Create person URN from sub
    const personUrn = `urn:li:person:${data.sub}`;

    return {
      id: data.sub,
      username: data.name || undefined,
      displayName: data.name,
      email: data.email,
      avatarUrl: data.picture,
      metadata: {
        personUrn,
        givenName: data.given_name,
        familyName: data.family_name,
        picture: data.picture,
        email: data.email,
      },
    };
  }

  /**
   * Get person URN for a user
   */
  async getPersonUrn(userId: string): Promise<string | null> {
    const connection = await this.getConnection(userId);
    if (!connection || !connection.metadata) {
      return null;
    }
    return (connection.metadata as Record<string, string>).personUrn || null;
  }

  /**
   * Get access token for API calls (convenience method)
   */
  async getAccessToken(userId: string): Promise<string | null> {
    const connection = await this.getConnection(userId);
    return connection?.accessToken || null;
  }
}
