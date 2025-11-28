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
 * Facebook Page response from /me/accounts endpoint
 */
interface FacebookPage {
  id: string;
  name: string;
  access_token: string;
  instagram_business_account?: {
    id: string;
  };
}

/**
 * Facebook Pages response
 */
interface FacebookPagesResponse {
  data: FacebookPage[];
  paging?: {
    cursors: {
      before: string;
      after: string;
    };
    next?: string;
  };
}

/**
 * Instagram Business Account response
 */
interface InstagramBusinessAccountResponse {
  instagram_business_account?: {
    id: string;
  };
  id: string;
}

/**
 * Instagram user profile response
 */
interface InstagramUserProfile {
  id: string;
  username: string;
  name?: string;
  profile_picture_url?: string;
  followers_count?: number;
  follows_count?: number;
  media_count?: number;
}

/**
 * Instagram OAuth Service
 * Implements OAuth 2.0 flow for Instagram via Facebook/Meta Graph API
 *
 * Instagram Graph API requires:
 * - Business or Creator Instagram account
 * - Facebook Page connected to the Instagram account
 * - instagram_basic and instagram_content_publish permissions
 */
@Injectable()
export class InstagramOAuthService extends BaseOAuthService {
  protected readonly platform: OAuthPlatform = 'instagram';
  protected readonly config: OAuthConfig;

  private readonly GRAPH_API_VERSION = 'v18.0';

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
        'Instagram OAuth credentials not configured. Authentication will not work.',
      );
    }
  }

  private loadConfig(): OAuthConfig {
    return {
      clientId: this.configService.get<string>('META_APP_ID') || '',
      clientSecret: this.configService.get<string>('META_APP_SECRET') || '',
      redirectUri:
        this.configService.get<string>('META_REDIRECT_URI') ||
        'http://localhost:3000/api/auth/instagram/callback',
      // Note: These scopes require Instagram Graph API product to be added to your Meta App
      // and permissions to be requested in App Review (works in dev mode for app admins/testers)
      scopes: [
        'instagram_business_basic',
        'instagram_business_content_publish',
        'instagram_business_manage_messages',
      ],
      authorizationUrl: `https://www.facebook.com/${this.GRAPH_API_VERSION}/dialog/oauth`,
      tokenUrl: `https://graph.facebook.com/${this.GRAPH_API_VERSION}/oauth/access_token`,
      userInfoUrl: `https://graph.facebook.com/${this.GRAPH_API_VERSION}/me`,
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

      // Exchange code for short-lived token
      const shortLivedToken = await this.fetchShortLivedToken(code);

      // Exchange short-lived token for long-lived token (valid for ~60 days)
      const longLivedToken = await this.exchangeForLongLivedToken(
        shortLivedToken.access_token,
      );

      // Get user's Facebook pages and find linked Instagram Business Account
      const instagramAccount = await this.getInstagramBusinessAccount(
        longLivedToken.access_token,
      );

      if (!instagramAccount) {
        throw new Error(
          'No Instagram Business or Creator account found. Please ensure your Instagram account is connected to a Facebook Page and is a Business or Creator account.',
        );
      }

      // Get Instagram user profile
      const userInfo = await this.fetchUserInfo(
        longLivedToken.access_token,
        instagramAccount.igUserId,
      );

      // Save connection with Instagram-specific metadata
      const connection = await this.saveToken(
        userId,
        {
          access_token: longLivedToken.access_token,
          expires_in: longLivedToken.expires_in,
          token_type: longLivedToken.token_type,
        },
        {
          ...userInfo,
          metadata: {
            ...userInfo.metadata,
            pageId: instagramAccount.pageId,
            pageAccessToken: instagramAccount.pageAccessToken,
            pageName: instagramAccount.pageName,
          },
        },
      );

      this.logger.log(
        `Successfully authenticated Instagram user: ${userInfo.username} (${userInfo.id})`,
      );

      return {
        success: true,
        userId,
        platform: this.platform,
        platformUserId: userInfo.id,
        platformUsername: userInfo.username,
        scopes: connection.scopes,
        expiresAt: connection.expiresAt || undefined,
        metadata: connection.metadata as Record<string, unknown>,
      };
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      const errorStack = getErrorStack(error);
      this.logger.error(
        `Failed to exchange code for token: ${errorMessage}`,
        errorStack,
      );
      throw new Error(`Instagram authentication failed: ${errorMessage}`);
    }
  }

  /**
   * Fetch short-lived access token from Meta
   */
  private async fetchShortLivedToken(
    code: string,
  ): Promise<OAuthTokenResponse> {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      redirect_uri: this.config.redirectUri,
      code,
    });

    const response = await fetch(
      `${this.config.tokenUrl}?${params.toString()}`,
    );

    const rawBody = await response.text();

    if (!response.ok) {
      this.logger.error(
        `Instagram token request failed (${response.status}): ${rawBody}`,
      );
      throw new Error(
        `Instagram token request failed: ${response.status} ${rawBody}`,
      );
    }

    try {
      return JSON.parse(rawBody) as OAuthTokenResponse;
    } catch (parseError) {
      this.logger.error(
        'Instagram token endpoint returned non-JSON response: ' + parseError,
        rawBody.substring(0, 200),
      );
      throw new Error(
        'Instagram token endpoint returned invalid JSON. Check your redirect URI and app credentials.',
      );
    }
  }

  /**
   * Exchange short-lived token for long-lived token
   */
  private async exchangeForLongLivedToken(
    shortLivedToken: string,
  ): Promise<OAuthTokenResponse> {
    const params = new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      fb_exchange_token: shortLivedToken,
    });

    const response = await fetch(
      `${this.config.tokenUrl}?${params.toString()}`,
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to exchange for long-lived token (${response.status}): ${errorText}`,
      );
    }

    return (await response.json()) as OAuthTokenResponse;
  }

  /**
   * Get Instagram Business Account linked to user's Facebook Pages
   */
  private async getInstagramBusinessAccount(accessToken: string): Promise<{
    igUserId: string;
    pageId: string;
    pageAccessToken: string;
    pageName: string;
  } | null> {
    // Get user's Facebook pages
    const pagesResponse = await fetch(
      `https://graph.facebook.com/${this.GRAPH_API_VERSION}/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${accessToken}`,
    );

    if (!pagesResponse.ok) {
      const errorText = await pagesResponse.text();
      throw new Error(
        `Failed to fetch Facebook pages (${pagesResponse.status}): ${errorText}`,
      );
    }

    const pagesData = (await pagesResponse.json()) as FacebookPagesResponse;

    if (!pagesData.data || pagesData.data.length === 0) {
      this.logger.warn('No Facebook pages found for this user');
      return null;
    }

    // Find a page with Instagram Business Account
    for (const page of pagesData.data) {
      if (page.instagram_business_account?.id) {
        return {
          igUserId: page.instagram_business_account.id,
          pageId: page.id,
          pageAccessToken: page.access_token,
          pageName: page.name,
        };
      }

      // Try to fetch instagram_business_account directly if not in initial response
      const pageDetailsResponse = await fetch(
        `https://graph.facebook.com/${this.GRAPH_API_VERSION}/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`,
      );

      if (pageDetailsResponse.ok) {
        const pageDetails =
          (await pageDetailsResponse.json()) as InstagramBusinessAccountResponse;
        if (pageDetails.instagram_business_account?.id) {
          return {
            igUserId: pageDetails.instagram_business_account.id,
            pageId: page.id,
            pageAccessToken: page.access_token,
            pageName: page.name,
          };
        }
      }
    }

    this.logger.warn(
      'No Facebook page with linked Instagram Business Account found',
    );
    return null;
  }

  /**
   * Fetch Instagram user profile
   */
  protected async fetchUserInfo(
    accessToken: string,
    igUserId?: string,
  ): Promise<OAuthUserInfo> {
    if (!igUserId) {
      throw new Error('Instagram user ID is required to fetch user info');
    }

    const response = await fetch(
      `https://graph.facebook.com/${this.GRAPH_API_VERSION}/${igUserId}?fields=id,username,name,profile_picture_url,followers_count,follows_count,media_count&access_token=${accessToken}`,
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to fetch Instagram user info (${response.status}): ${errorText}`,
      );
    }

    const data = (await response.json()) as InstagramUserProfile;

    return {
      id: data.id,
      username: data.username,
      displayName: data.name || data.username,
      avatarUrl: data.profile_picture_url,
      metadata: {
        igUserId: data.id,
        username: data.username,
        name: data.name,
        profilePictureUrl: data.profile_picture_url,
        followersCount: data.followers_count,
        followsCount: data.follows_count,
        mediaCount: data.media_count,
      },
    };
  }

  /**
   * Refresh access token
   * Meta long-lived tokens can be refreshed before they expire
   */
  override async refreshAccessToken(
    connection: SocialConnection,
  ): Promise<SocialConnection> {
    try {
      this.logger.log(`Refreshing access token for user: ${connection.userId}`);

      // Meta tokens are refreshed by exchanging the current long-lived token
      const params = new URLSearchParams({
        grant_type: 'fb_exchange_token',
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        fb_exchange_token: connection.accessToken,
      });

      const response = await fetch(
        `${this.config.tokenUrl}?${params.toString()}`,
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Token refresh failed (${response.status}): ${errorText}`,
        );
      }

      const tokenData = (await response.json()) as OAuthTokenResponse;

      // Update connection
      const now = new Date();
      connection.accessToken = tokenData.access_token;
      connection.expiresAt = tokenData.expires_in
        ? new Date(now.getTime() + tokenData.expires_in * 1000)
        : connection.expiresAt;

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
   * Get Instagram Business Account ID for a user
   */
  async getInstagramUserId(userId: string): Promise<string | null> {
    const connection = await this.getConnection(userId);
    if (!connection || !connection.platformUserId) {
      return null;
    }
    return connection.platformUserId;
  }

  /**
   * Get page access token (needed for publishing)
   */
  async getPageAccessToken(userId: string): Promise<string | null> {
    const connection = await this.getConnection(userId);
    if (!connection || !connection.metadata) {
      return null;
    }
    return (
      (connection.metadata as Record<string, string>).pageAccessToken || null
    );
  }

  /**
   * Get access token for API calls (convenience method)
   */
  async getAccessToken(userId: string): Promise<string | null> {
    const connection = await this.getConnection(userId);
    return connection?.accessToken || null;
  }
}
