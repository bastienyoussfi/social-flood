import { Injectable, Logger } from '@nestjs/common';
import { PostContent } from '../../common/interfaces';
import { LinkedInApiClient } from './linkedin-api.client';
import { LinkedInMediaService } from './linkedin-media.service';
import { LinkedInPostResult } from './interfaces';
import { getErrorMessage, getErrorStack } from '../../common/utils/error.utils';

/**
 * LinkedIn Service
 * Orchestrates the process of posting to LinkedIn
 * Coordinates between API client and media service
 */
@Injectable()
export class LinkedInService {
  private readonly logger = new Logger(LinkedInService.name);

  constructor(
    private readonly apiClient: LinkedInApiClient,
    private readonly mediaService: LinkedInMediaService,
  ) {}

  /**
   * Publish a post to LinkedIn
   * Handles text and media attachments
   * @param content - Post content with text and optional media
   * @returns Post ID and URL
   */
  async publishPost(content: PostContent): Promise<{
    platformPostId: string;
    url: string;
  }> {
    try {
      this.logger.log('Starting LinkedIn post publication');

      // Validate configuration
      if (!this.apiClient.isConfigured()) {
        throw new Error(
          'LinkedIn API is not properly configured. Please check your credentials (CLIENT_ID, CLIENT_SECRET, ACCESS_TOKEN, PERSON_URN).',
        );
      }

      // Validate content
      this.validateContent(content);

      // Step 1: Upload media if present
      let mediaUrns: string[] = [];
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
        mediaUrns = await this.mediaService.uploadMedia(content.media);
        this.logger.log(
          `Successfully uploaded ${mediaUrns.length} media item(s)`,
        );
      }

      // Step 2: Prepare post commentary
      let commentary = content.text;

      // Add link if provided (LinkedIn will auto-expand it)
      if (content.link) {
        commentary = `${commentary}\n\n${content.link}`;
      }

      // Step 3: Create post with text and media
      const result: LinkedInPostResult = await this.apiClient.createPost(
        commentary,
        mediaUrns.length > 0 ? mediaUrns : undefined,
      );

      this.logger.log(
        `LinkedIn post published successfully. ID: ${result.postId}, URL: ${result.url}`,
      );

      return {
        platformPostId: result.postId,
        url: result.url,
      };
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      const errorStack = getErrorStack(error);

      this.logger.error(
        `Failed to publish LinkedIn post: ${errorMessage}`,
        errorStack,
      );

      // Re-throw with context
      throw new Error(`LinkedIn posting failed: ${errorMessage}`);
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

    // LinkedIn's character limit is 3000 (already validated in adapter)
    // This is a safety check
    const maxLength = 3000;
    if (content.text.length > maxLength) {
      throw new Error(`Post text exceeds ${maxLength} characters`);
    }
  }

  /**
   * Check if the LinkedIn integration is ready
   * Useful for health checks
   */
  isReady(): boolean {
    return this.apiClient.isConfigured();
  }
}
