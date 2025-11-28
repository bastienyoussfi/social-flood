import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { PostContent } from '../../common/interfaces';
import { TwitterApiClient } from './twitter-api.client';
import { TwitterMediaService } from './twitter-media.service';
import { TwitterPostResult } from './interfaces';
import { getErrorMessage, getErrorStack } from '../../common/utils/error.utils';
import { TwitterOAuthService } from '../../auth/services/twitter-oauth.service';

/**
 * Twitter Service
 * Orchestrates the process of posting to Twitter
 * Supports both app-level (OAuth 1.0a) and user-level (OAuth 2.0) posting
 */
@Injectable()
export class TwitterService {
  private readonly logger = new Logger(TwitterService.name);

  constructor(
    private readonly apiClient: TwitterApiClient,
    private readonly mediaService: TwitterMediaService,
    @Inject(forwardRef(() => TwitterOAuthService))
    private readonly twitterOAuthService: TwitterOAuthService,
  ) {}

  /**
   * Publish a post to Twitter
   * Handles text and media attachments
   * Supports both app-level and user-level posting
   * @param content - Post content with text and optional media
   * @param twitterUserId - Optional Twitter user ID for user-level posting (OAuth 2.0)
   * @returns Tweet ID and URL
   */
  async publishPost(
    content: PostContent,
    twitterUserId?: string,
  ): Promise<{
    platformPostId: string;
    url: string;
  }> {
    try {
      // Determine posting mode
      const isUserLevelPosting = !!twitterUserId;

      if (isUserLevelPosting) {
        this.logger.log(
          `Starting Twitter post publication for user: ${twitterUserId}`,
        );
        return await this.publishAsUser(content, twitterUserId);
      } else {
        this.logger.log('Starting Twitter post publication (app-level)');
        return await this.publishAsApp(content);
      }
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      const errorStack = getErrorStack(error);

      this.logger.error(`Failed to publish tweet: ${errorMessage}`, errorStack);

      // Re-throw with context
      throw new Error(`Twitter posting failed: ${errorMessage}`);
    }
  }

  /**
   * Publish a post using app-level credentials (OAuth 1.0a)
   */
  private async publishAsApp(content: PostContent): Promise<{
    platformPostId: string;
    url: string;
  }> {
    // Validate configuration
    if (!this.apiClient.isConfigured()) {
      throw new Error(
        'Twitter API is not properly configured. Please check your OAuth 1.0a credentials or use user-level posting.',
      );
    }

    // Validate content
    this.validateContent(content);

    // Step 1: Upload media if present
    let mediaIds: string[] = [];
    if (content.media && content.media.length > 0) {
      this.logger.log(`Processing ${content.media.length} media attachment(s)`);

      // Validate media before attempting upload
      const mediaValidation = this.mediaService.validateMedia(content.media);
      if (!mediaValidation.valid) {
        throw new Error(
          `Media validation failed: ${mediaValidation.errors.join(', ')}`,
        );
      }

      // Upload media
      mediaIds = await this.mediaService.uploadMedia(content.media);
      this.logger.log(`Successfully uploaded ${mediaIds.length} media item(s)`);
    }

    // Step 2: Prepare tweet text
    let tweetText = content.text;

    // Add link if provided (Twitter will auto-expand it)
    if (content.link) {
      tweetText = `${tweetText}\n\n${content.link}`;
    }

    // Step 3: Post tweet with text and media
    const result: TwitterPostResult = await this.apiClient.postTweet(
      tweetText,
      mediaIds.length > 0 ? mediaIds : undefined,
    );

    this.logger.log(
      `Tweet published successfully (app-level). ID: ${result.tweetId}, URL: ${result.url}`,
    );

    return {
      platformPostId: result.tweetId,
      url: result.url,
    };
  }

  /**
   * Publish a post on behalf of a user using OAuth 2.0
   */
  private async publishAsUser(
    content: PostContent,
    twitterUserId: string,
  ): Promise<{
    platformPostId: string;
    url: string;
  }> {
    // Get the connection by platform user ID
    const connection =
      await this.twitterOAuthService.getConnectionByPlatformUserId(
        twitterUserId,
      );

    if (!connection) {
      throw new Error(
        `Twitter authentication not found for user ${twitterUserId}. Please authenticate first.`,
      );
    }

    // Refresh if needed
    let accessToken = connection.accessToken;
    if (connection.needsRefresh()) {
      this.logger.log('Access token needs refresh, refreshing...');
      const refreshedConnection =
        await this.twitterOAuthService.refreshAccessToken(connection);
      accessToken = refreshedConnection.accessToken;
    }

    // Validate content
    this.validateContent(content);

    // Step 1: Upload media if present (using user's token)
    let mediaIds: string[] = [];
    if (content.media && content.media.length > 0) {
      this.logger.log(
        `Processing ${content.media.length} media attachment(s) for user`,
      );

      // Validate media before attempting upload
      const mediaValidation = this.mediaService.validateMedia(content.media);
      if (!mediaValidation.valid) {
        throw new Error(
          `Media validation failed: ${mediaValidation.errors.join(', ')}`,
        );
      }

      // Upload media using user's token
      mediaIds = await this.mediaService.uploadMediaAsUser(
        content.media,
        accessToken,
      );
      this.logger.log(
        `Successfully uploaded ${mediaIds.length} media item(s) for user`,
      );
    }

    // Step 2: Prepare tweet text
    let tweetText = content.text;

    // Add link if provided (Twitter will auto-expand it)
    if (content.link) {
      tweetText = `${tweetText}\n\n${content.link}`;
    }

    // Step 3: Post tweet with text and media using user's token
    const result: TwitterPostResult = await this.apiClient.postTweetAsUser(
      accessToken,
      tweetText,
      mediaIds.length > 0 ? mediaIds : undefined,
    );

    this.logger.log(
      `Tweet published successfully (user-level). ID: ${result.tweetId}, URL: ${result.url}`,
    );

    return {
      platformPostId: result.tweetId,
      url: result.url,
    };
  }

  /**
   * Validate post content
   * Basic validation before processing
   */
  private validateContent(content: PostContent): void {
    if (!content.text || content.text.trim().length === 0) {
      throw new Error('Tweet text is required');
    }

    // Twitter's character limit is already validated in the adapter
    // This is a safety check
    if (content.text.length > 280) {
      throw new Error('Tweet text exceeds 280 characters');
    }
  }

  /**
   * Check if the Twitter integration is ready
   * Useful for health checks
   */
  isReady(): boolean {
    return this.apiClient.isConfigured();
  }
}
