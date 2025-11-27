import { Injectable, Logger } from '@nestjs/common';
import { PostContent } from '../../common/interfaces';
import { BlueskyApiClient } from './bluesky-api.client';
import { BlueskyMediaService } from './bluesky-media.service';
import {
  BlueskyPostResult,
  BlueskyBlobWithAlt,
  BLUESKY_MAX_TEXT_LENGTH,
} from './interfaces/bluesky-api.interface';
import { getErrorMessage, getErrorStack } from '../../common/utils/error.utils';

/**
 * Bluesky Service
 * Orchestrates the process of posting to Bluesky
 * Coordinates between API client and media service
 */
@Injectable()
export class BlueskyService {
  private readonly logger = new Logger(BlueskyService.name);

  constructor(
    private readonly apiClient: BlueskyApiClient,
    private readonly mediaService: BlueskyMediaService,
  ) {}

  /**
   * Publish a post to Bluesky
   * Handles text and media attachments
   * @param content - Post content with text and optional media
   * @returns Post ID and URL
   */
  async publishPost(content: PostContent): Promise<{
    platformPostId: string;
    url: string;
  }> {
    try {
      this.logger.log('Starting Bluesky post publication');

      // Validate configuration
      if (!this.apiClient.isConfigured()) {
        throw new Error(
          'Bluesky API is not properly configured. Please check your credentials.',
        );
      }

      // Validate content
      this.validateContent(content);

      // Step 1: Upload media if present
      let imageBlobs: BlueskyBlobWithAlt[] = [];
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
        imageBlobs = await this.mediaService.uploadMedia(content.media);
        this.logger.log(
          `Successfully uploaded ${imageBlobs.length} media item(s)`,
        );
      }

      // Step 2: Prepare post text
      let postText = content.text;

      // Add link if provided (Bluesky will auto-detect and create link card)
      if (content.link) {
        postText = `${postText}\n\n${content.link}`;
      }

      // Step 3: Post to Bluesky with text and media
      const result: BlueskyPostResult = await this.apiClient.createPost(
        postText,
        imageBlobs.length > 0 ? imageBlobs : undefined,
      );

      this.logger.log(
        `Bluesky post published successfully. ID: ${result.postId}, URL: ${result.url}`,
      );

      return {
        platformPostId: result.postId,
        url: result.url,
      };
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      const errorStack = getErrorStack(error);

      this.logger.error(
        `Failed to publish to Bluesky: ${errorMessage}`,
        errorStack,
      );

      // Re-throw with context
      throw new Error(`Bluesky posting failed: ${errorMessage}`);
    }
  }

  /**
   * Validate post content
   * Basic validation before processing
   */
  private validateContent(content: PostContent): void {
    if (!content.text || content.text.trim().length === 0) {
      throw new Error('Post text is required');
    }

    // Bluesky's character limit is already validated in the adapter
    // This is a safety check
    if (content.text.length > BLUESKY_MAX_TEXT_LENGTH) {
      throw new Error(
        `Post text exceeds ${BLUESKY_MAX_TEXT_LENGTH} characters`,
      );
    }
  }

  /**
   * Check if the Bluesky integration is ready
   * Useful for health checks
   */
  isReady(): boolean {
    return this.apiClient.isConfigured();
  }
}
