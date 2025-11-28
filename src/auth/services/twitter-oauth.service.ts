import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TwitterApi } from 'twitter-api-v2';
import { OAuthToken } from '../../database/entities';
import { BaseOAuthService } from '../base-oauth.service';
import { OAuthStateManager } from '../utils/state-manager';
import {
  OAuthPlatform,
  OAuthConfig,
  OAuthUserInfo,
  OAuthInitResult,
  OAuthCallbackResult,
  OAuthTokenResponse,
} from '../interfaces';
import { getErrorMessage, getErrorStack } from '../../common/utils/error.utils';

/**
 * Twitter OAuth Service
 * Implements OAuth 2.0 with PKCE flow for Twitter
 */
@Injectable()
export class TwitterOAuthService extends BaseOAuthService {
  protected readonly platform: OAuthPlatform = 'twitter';
  protected readonly config: OAuthConfig;

  constructor(
    @InjectRepository(OAuthToken)
    oauthTokenRepository: Repository<OAuthToken>,
    stateManager: OAuthStateManager,
    private readonly configService: ConfigService,
  ) {
    super(oauthTokenRepository, stateManager);
    this.config = this.loadConfig();

    if (!this.isConfigured()) {
      this.logger.warn(
        'Twitter OAuth 2.0 credentials not configured. User authentication will not work.',
      );
    }
  }

  private loadConfig(): OAuthConfig {
    return {
      clientId: this.configService.get<string>('TWITTER_CLIENT_ID') || '',
      clientSecret:
        this.configService.get<string>('TWITTER_CLIENT_SECRET') || '',
      redirectUri:
        this.configService.get<string>('TWITTER_OAUTH_REDIRECT_URI') ||
        'http://localhost:3000/api/auth/twitter/callback',
      scopes: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
      authorizationUrl: 'https://twitter.com/i/oauth2/authorize',
      tokenUrl: 'https://api.twitter.com/2/oauth2/token',
      userInfoUrl: 'https://api.twitter.com/2/users/me',
    };
  }

  /**
   * Generate authorization URL with PKCE
   */
  override getAuthorizationUrl(userId: string): OAuthInitResult {
    if (!this.isConfigured()) {
      throw new Error(
        'Twitter OAuth 2.0 is not configured. Please set TWITTER_CLIENT_ID and TWITTER_CLIENT_SECRET.',
      );
    }

    const { state, codeChallenge } = this.stateManager.generateStateWithPKCE(
      userId,
      this.platform,
    );

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: this.config.scopes.join(' '),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    const url = `${this.config.authorizationUrl}?${params.toString()}`;

    this.logger.log(
      `Generated Twitter OAuth 2.0 authorization URL for user ${userId}`,
    );

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

      const { userId, codeVerifier } = stateData;

      if (!codeVerifier) {
        throw new Error(
          'PKCE code verifier not found. Please try authenticating again.',
        );
      }

      // Exchange code for tokens with PKCE
      const tokenResponse = await this.fetchTokensWithPKCE(code, codeVerifier);

      // Get user info
      const userInfo = await this.fetchUserInfo(tokenResponse.access_token);

      // Save token
      const oauthToken = await this.saveToken(userId, tokenResponse, userInfo);

      this.logger.log(
        `Successfully authenticated Twitter user: @${userInfo.username} (${userInfo.id})`,
      );

      return {
        success: true,
        userId,
        platform: this.platform,
        platformUserId: userInfo.id,
        platformUsername: userInfo.username,
        scopes: oauthToken.scopes,
        expiresAt: oauthToken.expiresAt || undefined,
        metadata: userInfo.metadata,
      };
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      const errorStack = getErrorStack(error);
      this.logger.error(
        `Failed to exchange code for token: ${errorMessage}`,
        errorStack,
      );
      throw new Error(`Twitter authentication failed: ${errorMessage}`);
    }
  }

  /**
   * Fetch tokens with PKCE and Basic auth
   */
  private async fetchTokensWithPKCE(
    code: string,
    codeVerifier: string,
  ): Promise<OAuthTokenResponse> {
    const credentials = Buffer.from(
      `${this.config.clientId}:${this.config.clientSecret}`,
    ).toString('base64');

    const response = await fetch(this.config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        redirect_uri: this.config.redirectUri,
        code_verifier: codeVerifier,
      }),
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
   * Refresh access token with Basic auth
   */
  override async refreshAccessToken(
    oauthToken: OAuthToken,
  ): Promise<OAuthToken> {
    try {
      this.logger.log(`Refreshing access token for user: ${oauthToken.userId}`);

      if (!oauthToken.refreshToken) {
        throw new Error(
          'No refresh token available. User needs to re-authenticate.',
        );
      }

      const credentials = Buffer.from(
        `${this.config.clientId}:${this.config.clientSecret}`,
      ).toString('base64');

      const response = await fetch(this.config.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${credentials}`,
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: oauthToken.refreshToken,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Token refresh failed (${response.status}): ${errorText}`,
        );
      }

      const tokenData = (await response.json()) as OAuthTokenResponse;

      // Update tokens
      oauthToken.accessToken = tokenData.access_token;
      if (tokenData.refresh_token) {
        oauthToken.refreshToken = tokenData.refresh_token;
      }
      oauthToken.expiresAt = tokenData.expires_in
        ? new Date(Date.now() + tokenData.expires_in * 1000)
        : oauthToken.expiresAt;

      if (tokenData.scope) {
        oauthToken.scopes = tokenData.scope.split(' ');
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
   * Fetch user info from Twitter
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
      data: { id: string; name: string; username: string };
    };

    return {
      id: data.data.id,
      username: data.data.username,
      displayName: data.data.name,
      metadata: {
        displayName: data.data.name,
      },
    };
  }

  /**
   * Create a TwitterApi client for a specific user
   */
  createUserClient(accessToken: string): TwitterApi {
    return new TwitterApi(accessToken);
  }

  /**
   * Get TwitterApi client for a user ID
   */
  async getUserClient(userId: string): Promise<TwitterApi> {
    const accessToken = await this.getValidAccessToken(userId);
    return this.createUserClient(accessToken);
  }
}
