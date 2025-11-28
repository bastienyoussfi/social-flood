import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  TwitterApi,
  TweetV2PostTweetResult,
  ApiResponseError,
  SendTweetV2Params,
} from 'twitter-api-v2';
import {
  TwitterConfig,
  TwitterPostResult,
  TwitterAuthCredentials,
} from './interfaces';
import { getErrorMessage, getErrorStack } from '../../common/utils/error.utils';

/**
 * Twitter API v2 Client
 * Handles all direct communication with Twitter API
 * Supports both OAuth 1.0a (app-level) and OAuth 2.0 (user-level) authentication
 */
@Injectable()
export class TwitterApiClient {
  private readonly logger = new Logger(TwitterApiClient.name);
  private client: TwitterApi;
  private readonly config: TwitterConfig;
  private readonly isOAuth1Configured: boolean;

  constructor(private readonly configService: ConfigService) {
    this.config = this.loadConfig();
    this.isOAuth1Configured = this.checkOAuth1Config();
    if (this.isOAuth1Configured) {
      this.initializeClient();
    } else {
      this.logger.warn(
        'Twitter OAuth 1.0a credentials not configured. App-level posting disabled. ' +
          'User-level OAuth 2.0 posting is still available.',
      );
    }
  }

  /**
   * Load Twitter configuration from environment
   */
  private loadConfig(): TwitterConfig {
    const apiKey = this.configService.get<string>('TWITTER_API_KEY') || '';
    const apiSecret =
      this.configService.get<string>('TWITTER_API_SECRET') || '';
    const accessToken =
      this.configService.get<string>('TWITTER_ACCESS_TOKEN') || '';
    const accessTokenSecret =
      this.configService.get<string>('TWITTER_ACCESS_TOKEN_SECRET') || '';
    const bearerToken = this.configService.get<string>('TWITTER_BEARER_TOKEN');

    const config: TwitterConfig = {
      apiKey,
      apiSecret,
      accessToken,
      accessTokenSecret,
      bearerToken,
    };

    return config;
  }

  /**
   * Check if OAuth 1.0a credentials are configured
   */
  private checkOAuth1Config(): boolean {
    return !!(
      this.config.apiKey &&
      this.config.apiSecret &&
      this.config.accessToken &&
      this.config.accessTokenSecret
    );
  }

  /**
   * Initialize Twitter API client with OAuth 1.0a
   */
  private initializeClient(): void {
    try {
      const credentials: TwitterAuthCredentials = {
        appKey: this.config.apiKey,
        appSecret: this.config.apiSecret,
        accessToken: this.config.accessToken,
        accessSecret: this.config.accessTokenSecret,
      };

      this.client = new TwitterApi(credentials);
      this.logger.log('Twitter API client initialized successfully');
    } catch (error) {
      const errorStack = getErrorStack(error);
      this.logger.error('Failed to initialize Twitter API client', errorStack);
      throw error;
    }
  }

  /**
   * Post a tweet with text and optional media
   * @param text - Tweet text content
   * @param mediaIds - Array of uploaded media IDs
   * @returns Tweet ID and URL
   */
  async postTweet(
    text: string,
    mediaIds?: string[],
  ): Promise<TwitterPostResult> {
    try {
      this.logger.log(
        `Posting tweet: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`,
      );

      const tweetData: SendTweetV2Params = { text };

      // Add media if provided
      if (mediaIds && mediaIds.length > 0) {
        // Twitter API accepts up to 4 media IDs as specific tuple types
        const limitedIds = mediaIds.slice(0, 4);
        let typedMediaIds:
          | [string]
          | [string, string]
          | [string, string, string]
          | [string, string, string, string];

        switch (limitedIds.length) {
          case 1:
            typedMediaIds = [limitedIds[0]];
            break;
          case 2:
            typedMediaIds = [limitedIds[0], limitedIds[1]];
            break;
          case 3:
            typedMediaIds = [limitedIds[0], limitedIds[1], limitedIds[2]];
            break;
          default:
            typedMediaIds = [
              limitedIds[0],
              limitedIds[1],
              limitedIds[2],
              limitedIds[3],
            ];
        }

        tweetData.media = {
          media_ids: typedMediaIds,
        };
        this.logger.log(`Attaching ${limitedIds.length} media item(s)`);
      }

      // Post the tweet using v2 API
      const result: TweetV2PostTweetResult =
        await this.client.v2.tweet(tweetData);

      if (!result.data?.id) {
        throw new Error('Twitter API returned no tweet ID');
      }

      const tweetId = result.data.id;
      const url = this.buildTweetUrl(tweetId);

      this.logger.log(`Tweet posted successfully: ${url}`);

      return {
        tweetId,
        url,
        text: result.data.text,
      };
    } catch (error) {
      this.handleApiError(error);
    }
  }

  /**
   * Build Twitter URL from tweet ID
   * Note: We use a generic twitter.com URL since we don't have the username
   */
  private buildTweetUrl(tweetId: string): string {
    // In production, you might want to fetch the authenticated user's username
    // and use it here for a more accurate URL
    return `https://twitter.com/i/web/status/${tweetId}`;
  }

  /**
   * Handle Twitter API errors
   * Provides detailed error messages and logging
   */
  private handleApiError(error: unknown): never {
    if (error instanceof ApiResponseError) {
      // Twitter API v2 error
      const errorData = error.data;
      const errorMessage = error.message || 'Unknown Twitter API error';

      this.logger.error(
        `Twitter API Error: ${errorMessage}`,
        JSON.stringify(errorData, null, 2),
      );

      // Check for specific error types
      if (error.code === 429 || error.rateLimitError) {
        throw new Error('Twitter rate limit exceeded. Please try again later.');
      }

      if (error.code === 403) {
        throw new Error(
          'Twitter authentication failed. Please check your credentials.',
        );
      }

      if (error.code === 400) {
        throw new Error(`Twitter API validation error: ${errorMessage}`);
      }

      throw new Error(`Twitter API error: ${errorMessage}`);
    }

    // Generic error
    const errorMessage = getErrorMessage(error);
    const errorStack = getErrorStack(error);

    this.logger.error('Unexpected error posting to Twitter', errorStack);
    throw new Error(`Failed to post to Twitter: ${errorMessage}`);
  }

  /**
   * Get the Twitter API v1.1 client for media uploads
   * Media upload still uses v1.1 endpoint
   */
  getV1Client(): TwitterApi {
    return this.client;
  }

  /**
   * Check if the OAuth 1.0a client is properly configured
   */
  isConfigured(): boolean {
    return this.isOAuth1Configured;
  }

  /**
   * Create a Twitter API client for a specific user using OAuth 2.0 access token
   * @param accessToken - User's OAuth 2.0 access token
   * @returns TwitterApi client instance configured for the user
   */
  createUserClient(accessToken: string): TwitterApi {
    this.logger.log('Creating user-level Twitter API client with OAuth 2.0');
    return new TwitterApi(accessToken);
  }

  /**
   * Post a tweet on behalf of a user using their OAuth 2.0 access token
   * @param accessToken - User's OAuth 2.0 access token
   * @param text - Tweet text content
   * @param mediaIds - Array of uploaded media IDs (optional)
   * @returns Tweet ID and URL
   */
  async postTweetAsUser(
    accessToken: string,
    text: string,
    mediaIds?: string[],
  ): Promise<TwitterPostResult> {
    try {
      const userClient = this.createUserClient(accessToken);

      this.logger.log(
        `Posting tweet as user: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`,
      );

      const tweetData: SendTweetV2Params = { text };

      // Add media if provided
      if (mediaIds && mediaIds.length > 0) {
        const limitedIds = mediaIds.slice(0, 4);
        let typedMediaIds:
          | [string]
          | [string, string]
          | [string, string, string]
          | [string, string, string, string];

        switch (limitedIds.length) {
          case 1:
            typedMediaIds = [limitedIds[0]];
            break;
          case 2:
            typedMediaIds = [limitedIds[0], limitedIds[1]];
            break;
          case 3:
            typedMediaIds = [limitedIds[0], limitedIds[1], limitedIds[2]];
            break;
          default:
            typedMediaIds = [
              limitedIds[0],
              limitedIds[1],
              limitedIds[2],
              limitedIds[3],
            ];
        }

        tweetData.media = {
          media_ids: typedMediaIds,
        };
        this.logger.log(`Attaching ${limitedIds.length} media item(s)`);
      }

      // Post the tweet using v2 API
      const result: TweetV2PostTweetResult =
        await userClient.v2.tweet(tweetData);

      if (!result.data?.id) {
        throw new Error('Twitter API returned no tweet ID');
      }

      const tweetId = result.data.id;
      const url = this.buildTweetUrl(tweetId);

      this.logger.log(`Tweet posted successfully as user: ${url}`);

      return {
        tweetId,
        url,
        text: result.data.text,
      };
    } catch (error) {
      this.handleApiError(error);
    }
  }

  /**
   * Get a user client for media uploads
   * Note: Media upload with OAuth 2.0 requires different handling
   * @param accessToken - User's OAuth 2.0 access token
   * @returns TwitterApi client instance
   */
  getUserV1Client(accessToken: string): TwitterApi {
    return this.createUserClient(accessToken);
  }
}
