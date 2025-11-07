import { Injectable, Logger } from '@nestjs/common';
import { EUploadMimeType } from 'twitter-api-v2';
import { TwitterApiClient } from './twitter-api.client';
import { MediaAttachment } from '../../common/interfaces';
import { getErrorMessage, getErrorStack } from '../../common/utils/error.utils';

/**
 * Twitter Media Service
 * Handles downloading media from URLs and uploading to Twitter
 * Supports images (up to 4 per tweet)
 */
@Injectable()
export class TwitterMediaService {
  private readonly logger = new Logger(TwitterMediaService.name);
  private readonly MAX_IMAGES = 4;
  private readonly MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

  // Supported image MIME types
  private readonly SUPPORTED_IMAGE_TYPES = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
  ];

  constructor(private readonly apiClient: TwitterApiClient) {}

  /**
   * Upload media attachments to Twitter
   * @param media - Array of media attachments with URLs
   * @returns Array of Twitter media IDs
   */
  async uploadMedia(media: MediaAttachment[]): Promise<string[]> {
    if (!media || media.length === 0) {
      return [];
    }

    // Validate media count
    if (media.length > this.MAX_IMAGES) {
      throw new Error(
        `Twitter supports maximum ${this.MAX_IMAGES} images per tweet. Provided: ${media.length}`,
      );
    }

    this.logger.log(`Uploading ${media.length} media item(s) to Twitter`);

    const mediaIds: string[] = [];

    for (let i = 0; i < media.length; i++) {
      const attachment = media[i];

      try {
        this.logger.log(
          `Uploading media ${i + 1}/${media.length}: ${attachment.url}`,
        );

        // For now, we only support images
        if (attachment.type !== 'image') {
          this.logger.warn(
            `Skipping unsupported media type: ${attachment.type}`,
          );
          continue;
        }

        // Download and upload media
        const mediaId = await this.uploadSingleImage(attachment);
        mediaIds.push(mediaId);

        this.logger.log(`Media ${i + 1} uploaded successfully: ${mediaId}`);
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        const errorStack = getErrorStack(error);

        this.logger.error(
          `Failed to upload media ${i + 1}: ${errorMessage}`,
          errorStack,
        );
        // Continue with other media items
        // You might want to throw here depending on your requirements
      }
    }

    if (mediaIds.length === 0 && media.length > 0) {
      throw new Error('Failed to upload any media attachments');
    }

    this.logger.log(`Successfully uploaded ${mediaIds.length} media item(s)`);
    return mediaIds;
  }

  /**
   * Upload a single image to Twitter
   * @param attachment - Media attachment with URL
   * @returns Twitter media ID
   */
  private async uploadSingleImage(
    attachment: MediaAttachment,
  ): Promise<string> {
    try {
      // Download image from URL
      const imageBuffer = await this.downloadMedia(attachment.url);

      // Validate image size
      if (imageBuffer.length > this.MAX_IMAGE_SIZE) {
        throw new Error(
          `Image exceeds maximum size of ${this.MAX_IMAGE_SIZE / 1024 / 1024}MB`,
        );
      }

      // Get v1 client for media upload (media upload still uses v1.1 API)
      const v1Client = this.apiClient.getV1Client();

      // Upload to Twitter
      const mediaId = await v1Client.v1.uploadMedia(imageBuffer, {
        mimeType: EUploadMimeType.Png, // Twitter will handle conversion
        additionalOwners: undefined,
        longVideo: false,
      });

      // Add alt text if provided
      if (attachment.alt) {
        try {
          await v1Client.v1.createMediaMetadata(mediaId, {
            alt_text: { text: attachment.alt },
          });
          this.logger.log(`Alt text added to media ${mediaId}`);
        } catch (error) {
          // Alt text is optional, log but don't fail
          const errorMessage = getErrorMessage(error);
          this.logger.warn(`Failed to add alt text: ${errorMessage}`);
        }
      }

      return mediaId;
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      const errorStack = getErrorStack(error);

      this.logger.error(`Failed to upload image: ${errorMessage}`, errorStack);
      throw new Error(`Image upload failed: ${errorMessage}`);
    }
  }

  /**
   * Download media from URL
   * @param url - Media URL
   * @returns Buffer containing media data
   */
  private async downloadMedia(url: string): Promise<Buffer> {
    try {
      this.logger.log(`Downloading media from: ${url}`);

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Validate content type
      const contentType = response.headers.get('content-type');
      if (contentType && !this.SUPPORTED_IMAGE_TYPES.includes(contentType)) {
        this.logger.warn(
          `Potentially unsupported image type: ${contentType}. Proceeding anyway.`,
        );
      }

      // Convert to buffer
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      this.logger.log(`Downloaded ${buffer.length} bytes`);

      return buffer;
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      const errorStack = getErrorStack(error);

      this.logger.error(
        `Failed to download media: ${errorMessage}`,
        errorStack,
      );
      throw new Error(`Media download failed: ${errorMessage}`);
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
      errors.push(
        `Too many images. Twitter supports maximum ${this.MAX_IMAGES} images per tweet.`,
      );
    }

    // Check each attachment
    media.forEach((attachment, index) => {
      if (!attachment.url) {
        errors.push(`Media item ${index + 1} is missing URL`);
      }

      if (attachment.type !== 'image') {
        errors.push(
          `Media item ${index + 1} has unsupported type: ${attachment.type}. Only images are supported currently.`,
        );
      }

      // Validate URL format
      try {
        new URL(attachment.url);
      } catch {
        errors.push(
          `Media item ${index + 1} has invalid URL: ${attachment.url}`,
        );
      }
    });

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
