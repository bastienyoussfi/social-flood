import { Injectable, Logger } from '@nestjs/common';
import { MediaAttachment } from '../../common/interfaces';
import { getErrorMessage, getErrorStack } from '../../common/utils/error.utils';

/**
 * Pinterest Media Service
 * Handles media validation for Pinterest
 * Unlike other platforms, Pinterest fetches images from URLs directly,
 * so we don't need to download and re-upload them
 */
@Injectable()
export class PinterestMediaService {
  private readonly logger = new Logger(PinterestMediaService.name);
  private readonly MAX_IMAGES = 1; // Pinterest pins support 1 primary image

  // Supported image MIME types
  private readonly SUPPORTED_IMAGE_TYPES = [
    'image/jpeg',
    'image/jpg',
    'image/png',
  ];

  /**
   * Process media attachments for Pinterest
   * Pinterest fetches images from URLs, so we just need to validate and return the URL
   * @param media - Array of media attachments with URLs
   * @returns Image URL (Pinterest only supports 1 image per pin)
   */
  async processMedia(media: MediaAttachment[]): Promise<string | undefined> {
    if (!media || media.length === 0) {
      return undefined;
    }

    // Pinterest pins only support 1 primary image
    if (media.length > this.MAX_IMAGES) {
      this.logger.warn(
        `Pinterest pins support only 1 image. Using the first image and ignoring the rest.`,
      );
    }

    const attachment = media[0];

    try {
      this.logger.log(`Processing media for Pinterest: ${attachment.url}`);

      // Validate media type
      if (attachment.type !== 'image') {
        throw new Error(
          `Pinterest only supports images. Provided type: ${attachment.type}`,
        );
      }

      // Validate URL format
      try {
        new URL(attachment.url);
      } catch {
        throw new Error(`Invalid media URL: ${attachment.url}`);
      }

      // Optionally validate that the URL is accessible
      await this.validateImageUrl(attachment.url);

      this.logger.log(`Media validated successfully: ${attachment.url}`);

      return attachment.url;
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      const errorStack = getErrorStack(error);

      this.logger.error(`Failed to process media: ${errorMessage}`, errorStack);
      throw new Error(`Media processing failed: ${errorMessage}`);
    }
  }

  /**
   * Validate that an image URL is accessible
   * Makes a HEAD request to check if the URL exists and returns an image
   * @param url - Image URL to validate
   */
  private async validateImageUrl(url: string): Promise<void> {
    try {
      this.logger.log(`Validating image URL: ${url}`);

      const response = await fetch(url, { method: 'HEAD' });

      if (!response.ok) {
        throw new Error(`Image URL is not accessible: HTTP ${response.status}`);
      }

      // Validate content type
      const contentType = response.headers.get('content-type');
      if (contentType) {
        const isValidImageType = this.SUPPORTED_IMAGE_TYPES.some((type) =>
          contentType.toLowerCase().includes(type),
        );

        if (!isValidImageType) {
          this.logger.warn(
            `Potentially unsupported image type: ${contentType}. Pinterest supports PNG and JPEG.`,
          );
        }
      }

      this.logger.log('Image URL validated successfully');
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      const errorStack = getErrorStack(error);

      this.logger.error(
        `Failed to validate image URL: ${errorMessage}`,
        errorStack,
      );
      throw new Error(`Image URL validation failed: ${errorMessage}`);
    }
  }

  /**
   * Validate media attachments before processing
   * @param media - Array of media attachments
   * @returns Validation result
   */
  validateMedia(media: MediaAttachment[]): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!media || media.length === 0) {
      return { valid: true, errors: [] };
    }

    // Check count
    if (media.length > this.MAX_IMAGES) {
      this.logger.warn(
        `Pinterest pins support only ${this.MAX_IMAGES} image. Only the first image will be used.`,
      );
    }

    // Check first attachment (only one used)
    const attachment = media[0];

    if (!attachment.url) {
      errors.push('Media item is missing URL');
    }

    if (attachment.type !== 'image') {
      errors.push(
        `Pinterest only supports images. Provided type: ${attachment.type}`,
      );
    }

    // Validate URL format
    if (attachment.url) {
      try {
        new URL(attachment.url);
      } catch {
        errors.push(`Invalid media URL: ${attachment.url}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
