import { Injectable, Logger } from '@nestjs/common';
import { PostContent } from '../../common/interfaces';
import { PinterestApiClient } from './pinterest-api.client';
import { PinterestMediaService } from './pinterest-media.service';
import { PinterestPostResult } from './interfaces';
import { getErrorMessage, getErrorStack } from '../../common/utils/error.utils';

/**
 * Pinterest Service
 * Orchestrates the process of posting to Pinterest
 * Coordinates between API client and media service
 */
@Injectable()
export class PinterestService {
  private readonly logger = new Logger(PinterestService.name);

  constructor(
    private readonly apiClient: PinterestApiClient,
    private readonly mediaService: PinterestMediaService,
  ) {}

  /**
   * Publish a pin to Pinterest
   * Handles text and image attachment
   * @param content - Post content with text and optional media
   * @returns Pin ID and URL
   */
  async publishPost(content: PostContent): Promise<{
    platformPostId: string;
    url: string;
  }> {
    try {
      this.logger.log('Starting Pinterest pin publication');

      // Validate configuration
      if (!this.apiClient.isConfigured()) {
        throw new Error(
          'Pinterest API is not properly configured. Please check your credentials (APP_ID, ACCESS_TOKEN, BOARD_ID).',
        );
      }

      // Validate content
      this.validateContent(content);

      // Step 1: Process media (required for Pinterest pins)
      if (!content.media || content.media.length === 0) {
        throw new Error(
          'Pinterest pins require at least one image. Please provide media.',
        );
      }

      this.logger.log(`Processing ${content.media.length} media attachment(s)`);

      // Validate media before processing
      const mediaValidation = this.mediaService.validateMedia(content.media);
      if (!mediaValidation.valid) {
        throw new Error(
          `Media validation failed: ${mediaValidation.errors.join(', ')}`,
        );
      }

      // Process media (validates and returns URL)
      const imageUrl = await this.mediaService.processMedia(content.media);
      if (!imageUrl) {
        throw new Error('Failed to process media for Pinterest pin');
      }

      this.logger.log(`Media processed successfully: ${imageUrl}`);

      // Step 2: Prepare pin data
      // Pinterest pins use title and description
      // We'll use the first line of text as title and rest as description
      const lines = content.text.split('\n');
      const title = lines[0].substring(0, 100); // Pinterest max 100 chars for title
      const description = content.text.substring(0, 500); // Pinterest max 500 chars for description

      // Extract userId from metadata (for OAuth token lookup)
      const userId = content.metadata?.userId as string | undefined;

      // Step 3: Create pin with title, description, and image
      // Use content.link if provided, otherwise no link
      const result: PinterestPostResult = await this.apiClient.createPin(
        title,
        description,
        imageUrl,
        content.link,
        undefined, // boardId (use default)
        userId, // userId for OAuth token lookup
      );

      this.logger.log(
        `Pinterest pin published successfully. ID: ${result.postId}, URL: ${result.url}`,
      );

      return {
        platformPostId: result.postId,
        url: result.url,
      };
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      const errorStack = getErrorStack(error);

      this.logger.error(
        `Failed to publish Pinterest pin: ${errorMessage}`,
        errorStack,
      );

      // Re-throw with context
      throw new Error(`Pinterest posting failed: ${errorMessage}`);
    }
  }

  /**
   * Validate post content
   * Basic validation before processing
   */
  private validateContent(content: PostContent): void {
    if (!content.text || content.text.trim().length === 0) {
      throw new Error('Pin text is required');
    }

    // Pinterest's title limit is 100 chars, description is 500 chars
    // We use the first line as title
    const maxTitleLength = 100;
    const maxDescriptionLength = 500;

    if (content.text.length > maxDescriptionLength) {
      this.logger.warn(
        `Pin description exceeds ${maxDescriptionLength} characters. It will be truncated.`,
      );
    }

    const firstLine = content.text.split('\n')[0];
    if (firstLine.length > maxTitleLength) {
      this.logger.warn(
        `Pin title (first line) exceeds ${maxTitleLength} characters. It will be truncated.`,
      );
    }
  }

  /**
   * Check if the Pinterest integration is ready
   * Useful for health checks
   */
  isReady(): boolean {
    return this.apiClient.isConfigured();
  }
}
