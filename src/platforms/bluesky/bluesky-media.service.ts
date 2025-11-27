import { Injectable, Logger } from '@nestjs/common';
import { BlueskyApiClient } from './bluesky-api.client';
import { MediaAttachment } from '../../common/interfaces';
import {
  BlueskyBlobResponse,
  BlueskyBlobWithAlt,
  BLUESKY_MAX_IMAGES,
  BLUESKY_MAX_IMAGE_SIZE,
} from './interfaces/bluesky-api.interface';
import { getErrorMessage, getErrorStack } from '../../common/utils/error.utils';

/**
 * Bluesky Media Service
 * Handles downloading media from URLs and uploading to Bluesky as blobs
 * Supports images (up to 4 per post)
 */
@Injectable()
export class BlueskyMediaService {
  private readonly logger = new Logger(BlueskyMediaService.name);
  private readonly MAX_IMAGES = BLUESKY_MAX_IMAGES;
  private readonly MAX_IMAGE_SIZE = BLUESKY_MAX_IMAGE_SIZE;

  // Supported image MIME types
  private readonly SUPPORTED_IMAGE_TYPES = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
  ];

  // MIME type mapping
  private readonly MIME_TYPE_MAP: Record<string, string> = {
    'image/jpg': 'image/jpeg',
    'image/jpeg': 'image/jpeg',
    'image/png': 'image/png',
    'image/gif': 'image/gif',
    'image/webp': 'image/webp',
  };

  constructor(private readonly apiClient: BlueskyApiClient) {}

  /**
   * Upload media attachments to Bluesky
   * @param media - Array of media attachments with URLs
   * @returns Array of Bluesky blob responses with alt text
   */
  async uploadMedia(media: MediaAttachment[]): Promise<BlueskyBlobWithAlt[]> {
    if (!media || media.length === 0) {
      return [];
    }

    // Validate media count
    if (media.length > this.MAX_IMAGES) {
      throw new Error(
        `Bluesky supports maximum ${this.MAX_IMAGES} images per post. Provided: ${media.length}`,
      );
    }

    this.logger.log(`Uploading ${media.length} media item(s) to Bluesky`);

    const blobs: BlueskyBlobWithAlt[] = [];

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

        // Upload single image
        const blob = await this.uploadSingleImage(attachment);

        // Create blob with alt text metadata for later embedding
        const blobWithAlt: BlueskyBlobWithAlt = {
          ...blob,
          alt: attachment.alt || '',
        };

        blobs.push(blobWithAlt);

        this.logger.log(
          `Media ${i + 1} uploaded successfully: ${blob.blob.ref.$link}`,
        );
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

    if (blobs.length === 0 && media.length > 0) {
      throw new Error('Failed to upload any media attachments');
    }

    this.logger.log(`Successfully uploaded ${blobs.length} media item(s)`);
    return blobs;
  }

  /**
   * Upload a single image to Bluesky as a blob
   * @param attachment - Media attachment with URL
   * @returns Bluesky blob response
   */
  private async uploadSingleImage(
    attachment: MediaAttachment,
  ): Promise<BlueskyBlobResponse> {
    try {
      // Download image from URL
      const { buffer: imageBuffer, contentType } = await this.downloadMedia(
        attachment.url,
      );

      // Validate image size
      if (imageBuffer.length > this.MAX_IMAGE_SIZE) {
        throw new Error(
          `Image exceeds maximum size of ${this.MAX_IMAGE_SIZE / 1024}KB`,
        );
      }

      // Determine MIME type
      const mimeType = this.getMimeType(contentType);

      // Upload blob to Bluesky
      const blob = await this.apiClient.uploadBlob(imageBuffer, mimeType);

      return blob;
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
   * @returns Buffer containing media data and content type
   */
  private async downloadMedia(
    url: string,
  ): Promise<{ buffer: Buffer; contentType: string }> {
    try {
      this.logger.log(`Downloading media from: ${url}`);

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Get content type
      const contentType = response.headers.get('content-type') || 'image/jpeg';

      // Validate content type
      if (!this.SUPPORTED_IMAGE_TYPES.includes(contentType)) {
        this.logger.warn(
          `Potentially unsupported image type: ${contentType}. Proceeding anyway.`,
        );
      }

      // Convert to buffer
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      this.logger.log(`Downloaded ${buffer.length} bytes (${contentType})`);

      return { buffer, contentType };
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
   * Get appropriate MIME type for Bluesky
   * @param contentType - Content type from download
   * @returns MIME type string
   */
  private getMimeType(contentType: string): string {
    // Normalize content type
    const normalized = contentType.toLowerCase().split(';')[0].trim();
    return this.MIME_TYPE_MAP[normalized] || 'image/jpeg';
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
        `Too many images. Bluesky supports maximum ${this.MAX_IMAGES} images per post.`,
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
