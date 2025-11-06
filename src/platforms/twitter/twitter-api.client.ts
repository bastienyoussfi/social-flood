import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TwitterApi, TweetV2PostTweetResult, ApiResponseError } from 'twitter-api-v2';
import {
  TwitterConfig,
  TwitterPostResult,
  TwitterAuthCredentials,
} from './interfaces';

/**
 * Twitter API v2 Client
 * Handles all direct communication with Twitter API
 * Uses OAuth 1.0a for authentication (required for posting)
 */
@Injectable()
export class TwitterApiClient {
  private readonly logger = new Logger(TwitterApiClient.name);
  private client: TwitterApi;
  private readonly config: TwitterConfig;

  constructor(private readonly configService: ConfigService) {
    this.config = this.loadConfig();
    this.initializeClient();
  }

  /**
   * Load Twitter configuration from environment
   */
  private loadConfig(): TwitterConfig {
    const apiKey = this.configService.get<string>('TWITTER_API_KEY') || '';
    const apiSecret = this.configService.get<string>('TWITTER_API_SECRET') || '';
    const accessToken = this.configService.get<string>('TWITTER_ACCESS_TOKEN') || '';
    const accessTokenSecret = this.configService.get<string>('TWITTER_ACCESS_TOKEN_SECRET') || '';
    const bearerToken = this.configService.get<string>('TWITTER_BEARER_TOKEN');

    // Validate required OAuth 1.0a credentials
    if (!apiKey || !apiSecret || !accessToken || !accessTokenSecret) {
      throw new Error(
        'Twitter OAuth 1.0a credentials are not properly configured. ' +
        'Please set TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, and TWITTER_ACCESS_TOKEN_SECRET',
      );
    }

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
      this.logger.error('Failed to initialize Twitter API client', error.stack);
      throw error;
    }
  }

  /**
   * Post a tweet with text and optional media
   * @param text - Tweet text content
   * @param mediaIds - Array of uploaded media IDs
   * @returns Tweet ID and URL
   */
  async postTweet(text: string, mediaIds?: string[]): Promise<TwitterPostResult> {
    try {
      this.logger.log(`Posting tweet: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);

      const tweetData: any = { text };

      // Add media if provided
      if (mediaIds && mediaIds.length > 0) {
        tweetData.media = {
          media_ids: mediaIds,
        };
        this.logger.log(`Attaching ${mediaIds.length} media item(s)`);
      }

      // Post the tweet using v2 API
      const result: TweetV2PostTweetResult = await this.client.v2.tweet(tweetData);

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
  private handleApiError(error: any): never {
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
        throw new Error('Twitter authentication failed. Please check your credentials.');
      }

      if (error.code === 400) {
        throw new Error(`Twitter API validation error: ${errorMessage}`);
      }

      throw new Error(`Twitter API error: ${errorMessage}`);
    }

    // Generic error
    this.logger.error('Unexpected error posting to Twitter', error.stack);
    throw new Error(`Failed to post to Twitter: ${error.message || 'Unknown error'}`);
  }

  /**
   * Get the Twitter API v1.1 client for media uploads
   * Media upload still uses v1.1 endpoint
   */
  getV1Client(): TwitterApi {
    return this.client;
  }

  /**
   * Check if the client is properly configured
   */
  isConfigured(): boolean {
    return !!(
      this.config.apiKey &&
      this.config.apiSecret &&
      this.config.accessToken &&
      this.config.accessTokenSecret
    );
  }
}
