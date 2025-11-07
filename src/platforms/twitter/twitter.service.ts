import { Injectable, Logger } from '@nestjs/common';
import { PostContent } from '../../common/interfaces';
import { TwitterApiClient } from './twitter-api.client';
import { TwitterMediaService } from './twitter-media.service';
import { TwitterPostResult } from './interfaces';
import { getErrorMessage, getErrorStack } from '../../common/utils/error.utils';

/**
 * Twitter Service
 * Orchestrates the process of posting to Twitter
 * Coordinates between API client and media service
 */
@Injectable()
export class TwitterService {
  private readonly logger = new Logger(TwitterService.name);

  constructor(
    private readonly apiClient: TwitterApiClient,
    private readonly mediaService: TwitterMediaService,
  ) {}

  /**
   * Publish a post to Twitter
   * Handles text and media attachments
   * @param content - Post content with text and optional media
   * @returns Tweet ID and URL
   */
  async publishPost(content: PostContent): Promise<{
    platformPostId: string;
    url: string;
  }> {
    try {
      this.logger.log('Starting Twitter post publication');

      // Validate configuration
      if (!this.apiClient.isConfigured()) {
        throw new Error(
          'Twitter API is not properly configured. Please check your credentials.',
        );
      }

      // Validate content
      this.validateContent(content);

      // Step 1: Upload media if present
      let mediaIds: string[] = [];
      if (content.media && content.media.length > 0) {
        this.logger.log(
          `Processing ${content.media.length} media attachment(s)`,
        );

        // Validate media before attempting upload
        const mediaValidation = this.mediaService.validateMedia(content.media);
        if (!mediaValidation.valid) {
          throw new Error(
            `Media validation failed: ${mediaValidation.errors.join(', ')}`,
          );
        }

        // Upload media
        mediaIds = await this.mediaService.uploadMedia(content.media);
        this.logger.log(
          `Successfully uploaded ${mediaIds.length} media item(s)`,
        );
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
        `Tweet published successfully. ID: ${result.tweetId}, URL: ${result.url}`,
      );

      return {
        platformPostId: result.tweetId,
        url: result.url,
      };
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      const errorStack = getErrorStack(error);

      this.logger.error(`Failed to publish tweet: ${errorMessage}`, errorStack);

      // Re-throw with context
      throw new Error(`Twitter posting failed: ${errorMessage}`);
    }
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
