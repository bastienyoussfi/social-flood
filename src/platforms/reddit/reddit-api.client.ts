import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  RedditConfig,
  RedditTokenResponse,
} from './interfaces/reddit-config.interface';
import {
  RedditPostResult,
  RedditSubmitResponse,
  RedditPostKind,
} from './interfaces/reddit-api.interface';
import { getErrorMessage, getErrorStack } from '../../common/utils/error.utils';

/**
 * Reddit API Client
 * Handles OAuth2 authentication and communication with Reddit API
 * Implements token management with automatic refresh
 */
@Injectable()
export class RedditApiClient {
  private readonly logger = new Logger(RedditApiClient.name);
  private readonly config: RedditConfig;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  // API endpoints
  private readonly TOKEN_URL = 'https://www.reddit.com/api/v1/access_token';
  private readonly API_BASE_URL = 'https://oauth.reddit.com';

  constructor(private readonly configService: ConfigService) {
    this.config = {
      clientId: this.configService.get<string>('REDDIT_CLIENT_ID') || '',
      clientSecret: this.configService.get<string>('REDDIT_CLIENT_SECRET') || '',
      userAgent: this.configService.get<string>('REDDIT_USER_AGENT') || '',
      defaultSubreddit: this.configService.get<string>('REDDIT_DEFAULT_SUBREDDIT'),
    };
  }

  /**
   * Check if the Reddit API client is properly configured
   * @returns true if all required configuration is present
   */
  isConfigured(): boolean {
    return !!(
      this.config.clientId &&
      this.config.clientSecret &&
      this.config.userAgent
    );
  }

  /**
   * Authenticate with Reddit using OAuth2 client_credentials flow
   * Fetches a new access token and stores it with expiry time
   */
  async authenticate(): Promise<void> {
    try {
      this.logger.log('Authenticating with Reddit API');

      const credentials = Buffer.from(
        `${this.config.clientId}:${this.config.clientSecret}`,
      ).toString('base64');

      const response = await fetch(this.TOKEN_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': this.config.userAgent,
        },
        body: 'grant_type=client_credentials',
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Reddit authentication failed (${response.status}): ${errorText}`,
        );
      }

      const data: RedditTokenResponse = await response.json();

      this.accessToken = data.access_token;
      // Set expiry to current time + expires_in (minus 5 minutes buffer)
      this.tokenExpiry = Date.now() + (data.expires_in - 300) * 1000;

      this.logger.log('Successfully authenticated with Reddit API');
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      const errorStack = getErrorStack(error);

      this.logger.error(
        `Reddit authentication failed: ${errorMessage}`,
        errorStack,
      );

      throw new Error(`Reddit authentication failed: ${errorMessage}`);
    }
  }

  /**
   * Check if token is expired or about to expire, and refresh if needed
   */
  private async refreshTokenIfNeeded(): Promise<void> {
    // If no token or token expired, authenticate
    if (!this.accessToken || Date.now() >= this.tokenExpiry) {
      this.logger.log('Token expired or missing, refreshing...');
      await this.authenticate();
    }
  }

  /**
   * Make an authenticated request to Reddit API
   * Automatically handles token refresh
   */
  private async makeAuthenticatedRequest(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<Response> {
    await this.refreshTokenIfNeeded();

    const url = `${this.API_BASE_URL}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `bearer ${this.accessToken}`,
        'User-Agent': this.config.userAgent,
        ...options.headers,
      },
    });

    return response;
  }

  /**
   * Parse Reddit API errors from response
   * Reddit returns errors in a specific format: [[code, message, field], ...]
   */
  private parseRedditErrors(response: RedditSubmitResponse): string {
    if (response.json?.errors && response.json.errors.length > 0) {
      return response.json.errors
        .map((err) => `${err[0]}: ${err[1]}`)
        .join('; ');
    }
    return 'Unknown Reddit API error';
  }

  /**
   * Create a text post (self post) on Reddit
   * @param subreddit - Target subreddit name (without /r/)
   * @param title - Post title (max 300 characters)
   * @param text - Post text content (markdown supported, max 40000 characters)
   * @returns Post ID and URL
   */
  async createTextPost(
    subreddit: string,
    title: string,
    text: string,
  ): Promise<RedditPostResult> {
    try {
      this.logger.log(`Creating text post in r/${subreddit}`);

      const formData = new URLSearchParams({
        sr: subreddit,
        kind: RedditPostKind.SELF,
        title: title,
        text: text,
        api_type: 'json',
      });

      const response = await this.makeAuthenticatedRequest('/api/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Reddit API request failed (${response.status}): ${errorText}`,
        );
      }

      const data: RedditSubmitResponse = await response.json();

      // Check for Reddit-specific errors
      if (data.json.errors && data.json.errors.length > 0) {
        const errorMessage = this.parseRedditErrors(data);
        throw new Error(`Reddit submission error: ${errorMessage}`);
      }

      const postId = data.json.data.name;
      const shortId = data.json.data.id;
      const titleSlug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '');

      // Construct permalink
      const url = `https://reddit.com/r/${subreddit}/comments/${shortId}/${titleSlug}/`;

      this.logger.log(
        `Text post created successfully. ID: ${postId}, URL: ${url}`,
      );

      return { postId, url };
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      const errorStack = getErrorStack(error);

      this.logger.error(
        `Failed to create text post: ${errorMessage}`,
        errorStack,
      );

      throw new Error(`Reddit text post creation failed: ${errorMessage}`);
    }
  }

  /**
   * Create a link post on Reddit
   * @param subreddit - Target subreddit name (without /r/)
   * @param title - Post title (max 300 characters)
   * @param url - URL to link to (or uploaded media URL)
   * @returns Post ID and URL
   */
  async createLinkPost(
    subreddit: string,
    title: string,
    url: string,
  ): Promise<RedditPostResult> {
    try {
      this.logger.log(`Creating link post in r/${subreddit}`);

      const formData = new URLSearchParams({
        sr: subreddit,
        kind: RedditPostKind.LINK,
        title: title,
        url: url,
        api_type: 'json',
      });

      const response = await this.makeAuthenticatedRequest('/api/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Reddit API request failed (${response.status}): ${errorText}`,
        );
      }

      const data: RedditSubmitResponse = await response.json();

      // Check for Reddit-specific errors
      if (data.json.errors && data.json.errors.length > 0) {
        const errorMessage = this.parseRedditErrors(data);
        throw new Error(`Reddit submission error: ${errorMessage}`);
      }

      const postId = data.json.data.name;
      const shortId = data.json.data.id;
      const titleSlug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '');

      // Construct permalink
      const postUrl = `https://reddit.com/r/${subreddit}/comments/${shortId}/${titleSlug}/`;

      this.logger.log(
        `Link post created successfully. ID: ${postId}, URL: ${postUrl}`,
      );

      return { postId, url: postUrl };
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      const errorStack = getErrorStack(error);

      this.logger.error(
        `Failed to create link post: ${errorMessage}`,
        errorStack,
      );

      throw new Error(`Reddit link post creation failed: ${errorMessage}`);
    }
  }

  /**
   * Get default subreddit from configuration
   * @returns Default subreddit name or undefined
   */
  getDefaultSubreddit(): string | undefined {
    return this.config.defaultSubreddit;
  }
}
