import { Injectable, Logger } from '@nestjs/common';
import { MediaAttachment } from '../../common/interfaces';
import { DEFAULT_INSTAGRAM_CONFIG } from './interfaces';

/**
 * Media validation result
 */
interface MediaValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Instagram Media Service
 * Handles media validation and processing for Instagram posts
 */
@Injectable()
export class InstagramMediaService {
  private readonly logger = new Logger(InstagramMediaService.name);
  private readonly config = DEFAULT_INSTAGRAM_CONFIG;

  /**
   * Validate media attachments for Instagram
   */
  validateMedia(media: MediaAttachment[]): MediaValidationResult {
    const errors: string[] = [];

    if (!media || media.length === 0) {
      errors.push(
        'At least one media attachment is required for Instagram posts',
      );
      return { valid: false, errors };
    }

    // Instagram supports up to 10 items in a carousel
    if (media.length > 10) {
      errors.push('Instagram supports a maximum of 10 media items per post');
    }

    for (let i = 0; i < media.length; i++) {
      const item = media[i];
      const itemErrors = this.validateMediaItem(item, i);
      errors.push(...itemErrors);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate a single media item
   */
  private validateMediaItem(media: MediaAttachment, index: number): string[] {
    const errors: string[] = [];
    const prefix = `Media item ${index + 1}`;

    // Validate URL
    if (!media.url) {
      errors.push(`${prefix}: URL is required`);
      return errors;
    }

    // Check if URL is valid
    try {
      new URL(media.url);
    } catch {
      errors.push(`${prefix}: Invalid URL format`);
      return errors;
    }

    // Validate media type
    if (!['image', 'video'].includes(media.type)) {
      errors.push(`${prefix}: Invalid media type. Must be 'image' or 'video'`);
      return errors;
    }

    // Check URL extension for format validation
    const urlLower = media.url.toLowerCase();

    if (media.type === 'image') {
      const hasValidImageFormat = this.config.supportedImageFormats.some(
        (format) =>
          urlLower.includes(`.${format}`) ||
          urlLower.includes(`format=${format}`),
      );

      // Only warn, don't reject - the URL might be a CDN URL without extension
      if (!hasValidImageFormat && !urlLower.includes('?')) {
        this.logger.warn(
          `${prefix}: Image URL may not have a supported format (${this.config.supportedImageFormats.join(', ')})`,
        );
      }
    }

    if (media.type === 'video') {
      const hasValidVideoFormat = this.config.supportedVideoFormats.some(
        (format) =>
          urlLower.includes(`.${format}`) ||
          urlLower.includes(`format=${format}`),
      );

      if (!hasValidVideoFormat && !urlLower.includes('?')) {
        this.logger.warn(
          `${prefix}: Video URL may not have a supported format (${this.config.supportedVideoFormats.join(', ')})`,
        );
      }
    }

    return errors;
  }

  /**
   * Process media for Instagram posting
   * Returns the primary media URL to use
   */
  processMedia(media: MediaAttachment[]): string | null {
    if (!media || media.length === 0) {
      return null;
    }

    // For now, return the first media URL
    // Instagram's container API accepts the URL directly
    const primaryMedia = media[0];

    this.logger.log(
      `Processing ${media.length} media item(s) for Instagram. Primary: ${primaryMedia.type}`,
    );

    return primaryMedia.url;
  }

  /**
   * Get media type from attachment
   */
  getMediaType(media: MediaAttachment): 'image' | 'video' {
    return media.type;
  }

  /**
   * Check if media is a video
   */
  isVideo(media: MediaAttachment): boolean {
    return media.type === 'video';
  }

  /**
   * Check if this should be posted as a carousel
   */
  isCarousel(media: MediaAttachment[]): boolean {
    return media.length > 1;
  }

  /**
   * Validate caption length
   */
  validateCaption(caption: string): MediaValidationResult {
    const errors: string[] = [];

    if (caption.length > this.config.maxCaptionLength) {
      errors.push(
        `Caption exceeds maximum length of ${this.config.maxCaptionLength} characters (current: ${caption.length})`,
      );
    }

    // Count hashtags
    const hashtagCount = (caption.match(/#\w+/g) || []).length;
    if (hashtagCount > this.config.maxHashtags) {
      errors.push(
        `Too many hashtags. Maximum allowed: ${this.config.maxHashtags}, found: ${hashtagCount}`,
      );
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Truncate caption if necessary
   */
  truncateCaption(caption: string): string {
    if (caption.length <= this.config.maxCaptionLength) {
      return caption;
    }

    // Truncate and add ellipsis
    const truncated = caption.substring(0, this.config.maxCaptionLength - 3);

    // Try to break at a word boundary
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > this.config.maxCaptionLength - 100) {
      return truncated.substring(0, lastSpace) + '...';
    }

    return truncated + '...';
  }
}
