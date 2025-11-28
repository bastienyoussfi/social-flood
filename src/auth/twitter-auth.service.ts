import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TwitterApi } from 'twitter-api-v2';
import { OAuthToken } from '../database/entities';
import { getErrorMessage, getErrorStack } from '../common/utils/error.utils';
import { randomBytes, createHash } from 'crypto';

interface TwitterTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

interface TwitterUserResponse {
  data: {
    id: string;
    name: string;
    username: string;
  };
}

interface PKCEChallenge {
  codeVerifier: string;
  codeChallenge: string;
  state: string;
  createdAt: Date;
}

/**
 * Twitter Authentication Service
 * Handles OAuth 2.0 with PKCE flow, token management, and refresh
 */
@Injectable()
export class TwitterAuthService {
  private readonly logger = new Logger(TwitterAuthService.name);
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly authorizationUrl = 'https://twitter.com/i/oauth2/authorize';
  private readonly tokenUrl = 'https://api.twitter.com/2/oauth2/token';

  // In-memory storage for PKCE challenges (in production, use Redis or session)
  private readonly pkceStore = new Map<string, PKCEChallenge>();
  private readonly PKCE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

  // OAuth 2.0 scopes for Twitter
  private readonly SCOPES = [
    'tweet.read',
    'tweet.write',
    'users.read',
    'offline.access', // Required for refresh tokens
  ];

  constructor(
    @InjectRepository(OAuthToken)
    private readonly oauthTokenRepository: Repository<OAuthToken>,
    private readonly configService: ConfigService,
  ) {
    this.clientId = this.configService.get<string>('TWITTER_CLIENT_ID') || '';
    this.clientSecret =
      this.configService.get<string>('TWITTER_CLIENT_SECRET') || '';
    this.redirectUri =
      this.configService.get<string>('TWITTER_OAUTH_REDIRECT_URI') ||
      'http://localhost:3000/api/auth/twitter/callback';

    if (!this.clientId || !this.clientSecret) {
      this.logger.warn(
        'Twitter OAuth 2.0 credentials not configured. User authentication will not work.',
      );
    }

    // Clean up expired PKCE challenges periodically
    setInterval(() => this.cleanupExpiredPKCE(), 5 * 60 * 1000);
  }

  /**
   * Generate PKCE code verifier and challenge
   */
  private generatePKCE(): { codeVerifier: string; codeChallenge: string } {
    // Generate random code verifier (43-128 characters)
    const codeVerifier = randomBytes(32)
      .toString('base64url')
      .replace(/[^a-zA-Z0-9]/g, '')
      .substring(0, 128);

    // Generate code challenge using SHA256
    const codeChallenge = createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');

    return { codeVerifier, codeChallenge };
  }

  /**
   * Generate authorization URL for user to authenticate
   * @returns Authorization URL and state for verification
   */
  getAuthorizationUrl(): { url: string; state: string } {
    const state = randomBytes(16).toString('hex');
    const { codeVerifier, codeChallenge } = this.generatePKCE();

    // Store PKCE challenge for later verification
    this.pkceStore.set(state, {
      codeVerifier,
      codeChallenge,
      state,
      createdAt: new Date(),
    });

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: this.SCOPES.join(' '),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    const url = `${this.authorizationUrl}?${params.toString()}`;

    this.logger.log('Generated Twitter OAuth 2.0 authorization URL');

    return { url, state };
  }

  /**
   * Exchange authorization code for access token
   * @param code - Authorization code from callback
   * @param state - State parameter for PKCE verification
   * @returns OAuthToken entity with tokens
   */
  async exchangeCodeForToken(code: string, state: string): Promise<OAuthToken> {
    try {
      this.logger.log('Exchanging authorization code for access token');

      // Retrieve PKCE challenge
      const pkceChallenge = this.pkceStore.get(state);
      if (!pkceChallenge) {
        throw new Error(
          'Invalid or expired state parameter. Please try authenticating again.',
        );
      }

      // Remove PKCE challenge after use
      this.pkceStore.delete(state);

      // Exchange code for tokens
      const tokenResponse = await this.fetchTokens(
        code,
        pkceChallenge.codeVerifier,
      );

      // Get user info
      const userInfo = await this.fetchUserInfo(tokenResponse.access_token);

      const twitterUserId = userInfo.data.id;
      const twitterUsername = userInfo.data.username;

      // Calculate expiry date
      const expiresAt = new Date(Date.now() + tokenResponse.expires_in * 1000);

      // Check if user already exists
      let oauthToken = await this.oauthTokenRepository.findOne({
        where: { platformUserId: twitterUserId, platform: 'twitter' },
      });

      if (oauthToken) {
        // Update existing auth
        oauthToken.accessToken = tokenResponse.access_token;
        oauthToken.refreshToken = tokenResponse.refresh_token || null;
        oauthToken.expiresAt = expiresAt;
        oauthToken.platformUsername = twitterUsername;
        oauthToken.scopes = tokenResponse.scope.split(' ');
        oauthToken.isActive = true;
      } else {
        // Create new auth
        oauthToken = this.oauthTokenRepository.create({
          userId: twitterUserId, // Using Twitter user ID as the user identifier
          platform: 'twitter',
          platformUserId: twitterUserId,
          platformUsername: twitterUsername,
          accessToken: tokenResponse.access_token,
          refreshToken: tokenResponse.refresh_token || null,
          expiresAt,
          scopes: tokenResponse.scope.split(' '),
          isActive: true,
          metadata: {
            displayName: userInfo.data.name,
          },
        });
      }

      await this.oauthTokenRepository.save(oauthToken);

      this.logger.log(
        `Successfully authenticated Twitter user: @${twitterUsername} (${twitterUserId})`,
      );

      return oauthToken;
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
   * Refresh access token using refresh token
   * @param oauthToken - OAuthToken entity with refresh token
   * @returns Updated OAuthToken entity
   */
  async refreshAccessToken(oauthToken: OAuthToken): Promise<OAuthToken> {
    try {
      this.logger.log(
        `Refreshing access token for user: ${oauthToken.platformUserId}`,
      );

      if (!oauthToken.refreshToken) {
        throw new Error(
          'No refresh token available. User needs to re-authenticate.',
        );
      }

      const credentials = Buffer.from(
        `${this.clientId}:${this.clientSecret}`,
      ).toString('base64');

      const response = await fetch(this.tokenUrl, {
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

      const tokenData = (await response.json()) as TwitterTokenResponse;

      // Update tokens
      oauthToken.accessToken = tokenData.access_token;
      if (tokenData.refresh_token) {
        oauthToken.refreshToken = tokenData.refresh_token;
      }
      oauthToken.expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);
      oauthToken.scopes = tokenData.scope.split(' ');

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
   * Get valid access token for a Twitter user (refresh if needed)
   * @param twitterUserId - Twitter user ID (platform user ID)
   * @returns Valid access token
   */
  async getValidAccessToken(twitterUserId: string): Promise<string> {
    let oauthToken = await this.oauthTokenRepository.findOne({
      where: {
        platformUserId: twitterUserId,
        platform: 'twitter',
        isActive: true,
      },
    });

    if (!oauthToken) {
      throw new Error(
        'Twitter authentication not found. User needs to authenticate.',
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
   * Get Twitter auth by user ID
   * @param twitterUserId - Twitter user ID
   * @returns OAuthToken entity or null
   */
  async getAuthByUserId(twitterUserId: string): Promise<OAuthToken | null> {
    return this.oauthTokenRepository.findOne({
      where: { platformUserId: twitterUserId, platform: 'twitter' },
    });
  }

  /**
   * Get all authenticated Twitter users
   * @returns Array of OAuthToken entities
   */
  async getAllAuthenticatedUsers(): Promise<OAuthToken[]> {
    return this.oauthTokenRepository.find({
      where: { platform: 'twitter', isActive: true },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Delete Twitter authentication
   * @param twitterUserId - Twitter user ID
   */
  async deleteAuth(twitterUserId: string): Promise<void> {
    await this.oauthTokenRepository.update(
      { platformUserId: twitterUserId, platform: 'twitter' },
      { isActive: false },
    );
    this.logger.log(`Deactivated Twitter auth for user: ${twitterUserId}`);
  }

  /**
   * Create a TwitterApi client for a specific user
   * @param accessToken - User's OAuth 2.0 access token
   * @returns TwitterApi client instance
   */
  createUserClient(accessToken: string): TwitterApi {
    return new TwitterApi(accessToken);
  }

  /**
   * Fetch tokens from Twitter
   * @param code - Authorization code
   * @param codeVerifier - PKCE code verifier
   * @returns Token response
   */
  private async fetchTokens(
    code: string,
    codeVerifier: string,
  ): Promise<TwitterTokenResponse> {
    const credentials = Buffer.from(
      `${this.clientId}:${this.clientSecret}`,
    ).toString('base64');

    const response = await fetch(this.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        redirect_uri: this.redirectUri,
        code_verifier: codeVerifier,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Token exchange failed (${response.status}): ${errorText}`,
      );
    }

    return (await response.json()) as TwitterTokenResponse;
  }

  /**
   * Fetch user info from Twitter
   * @param accessToken - Access token
   * @returns User info response
   */
  private async fetchUserInfo(
    accessToken: string,
  ): Promise<TwitterUserResponse> {
    const response = await fetch('https://api.twitter.com/2/users/me', {
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

    return (await response.json()) as TwitterUserResponse;
  }

  /**
   * Clean up expired PKCE challenges
   */
  private cleanupExpiredPKCE(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [state, challenge] of this.pkceStore.entries()) {
      if (now - challenge.createdAt.getTime() > this.PKCE_EXPIRY_MS) {
        this.pkceStore.delete(state);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.debug(`Cleaned up ${cleaned} expired PKCE challenges`);
    }
  }

  /**
   * Check if the service is properly configured
   */
  isConfigured(): boolean {
    return !!(this.clientId && this.clientSecret);
  }
}
