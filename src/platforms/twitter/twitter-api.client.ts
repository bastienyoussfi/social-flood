import { Injectable, Logger } from '@nestjs/common';
import {
  TwitterApi,
  TweetV2PostTweetResult,
  ApiResponseError,
  SendTweetV2Params,
} from 'twitter-api-v2';
import { TwitterPostResult } from './interfaces';
import { getErrorMessage, getErrorStack } from '../../common/utils/error.utils';

/**
 * Twitter API v2 Client
 * Handles all direct communication with Twitter API using OAuth 2.0
 */
@Injectable()
export class TwitterApiClient {
  private readonly logger = new Logger(TwitterApiClient.name);

  constructor() {
    this.logger.log('Twitter API client initialized (OAuth 2.0 mode)');
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
   * Build Twitter URL from tweet ID
   */
  private buildTweetUrl(tweetId: string): string {
    return `https://twitter.com/i/web/status/${tweetId}`;
  }

  /**
   * Handle Twitter API errors
   * Provides detailed error messages and logging
   */
  private handleApiError(error: unknown): never {
    if (error instanceof ApiResponseError) {
      const errorData = error.data;
      const errorMessage = error.message || 'Unknown Twitter API error';

      this.logger.error(
        `Twitter API Error: ${errorMessage}`,
        JSON.stringify(errorData, null, 2),
      );

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

    const errorMessage = getErrorMessage(error);
    const errorStack = getErrorStack(error);

    this.logger.error('Unexpected error posting to Twitter', errorStack);
    throw new Error(`Failed to post to Twitter: ${errorMessage}`);
  }
}
