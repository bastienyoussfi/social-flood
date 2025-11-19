import { Injectable, Logger } from '@nestjs/common';
import { YoutubeApiClient } from './youtube-api.client';
import { MediaAttachment } from '../../common/interfaces';
import { getErrorMessage, getErrorStack } from '../../common/utils/error.utils';

/**
 * YouTube Media Service
 * Handles downloading videos from URLs and uploading to YouTube
 * Supports various video formats as per YouTube requirements
 */
@Injectable()
export class YoutubeMediaService {
  private readonly logger = new Logger(YoutubeMediaService.name);

  // YouTube video requirements
  // Default limits for unverified accounts
  private readonly MAX_VIDEO_SIZE_DEFAULT = 128 * 1024 * 1024 * 1024; // 128GB
  // Verified account limits
  private readonly MAX_VIDEO_SIZE_VERIFIED = 256 * 1024 * 1024 * 1024; // 256GB
  private readonly MAX_VIDEO_DURATION_DEFAULT = 15 * 60; // 15 minutes in seconds
  private readonly MAX_VIDEO_DURATION_VERIFIED = 12 * 60 * 60; // 12 hours in seconds

  // Supported video formats
  // Source: https://support.google.com/youtube/troubleshooter/2888402
  private readonly SUPPORTED_VIDEO_TYPES = [
    'video/mp4',
    'video/quicktime', // .mov
    'video/x-msvideo', // .avi
    'video/x-ms-wmv', // .wmv
    'video/x-flv', // .flv
    'video/3gpp', // .3gp
    'video/webm',
    'video/mpeg',
  ];

  // Video file signatures (magic bytes) for validation
  private readonly VIDEO_SIGNATURES = [
    // MP4
    { signature: '66747970', offset: 4, name: 'MP4' },
    // WebM
    { signature: '1a45dfa3', offset: 0, name: 'WebM' },
    // AVI
    { signature: '415649', offset: 8, name: 'AVI' },
    // FLV
    { signature: '464c56', offset: 0, name: 'FLV' },
    // MOV
    { signature: '66726565', offset: 4, name: 'MOV/QuickTime' },
    { signature: '6d646174', offset: 4, name: 'MOV/QuickTime' },
    { signature: '6d6f6f76', offset: 4, name: 'MOV/QuickTime' },
    { signature: '77696465', offset: 4, name: 'MOV/QuickTime' },
  ];

  constructor(private readonly apiClient: YoutubeApiClient) {}

  /**
   * Download video from URL
   * @param url - Video URL
   * @returns Buffer containing video data
   */
  async downloadVideo(url: string): Promise<Buffer> {
    try {
      this.logger.log(`Downloading video from: ${url}`);

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Validate content type if provided
      const contentType = response.headers.get('content-type');
      if (contentType && !this.SUPPORTED_VIDEO_TYPES.some(type => contentType.includes(type))) {
        this.logger.warn(
          `Potentially unsupported video type: ${contentType}. YouTube may reject this format.`,
        );
      }

      // Convert to buffer
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const sizeMB = (buffer.length / 1024 / 1024).toFixed(2);
      this.logger.log(`Downloaded ${sizeMB} MB`);

      return buffer;
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      const errorStack = getErrorStack(error);

      this.logger.error(
        `Failed to download video: ${errorMessage}`,
        errorStack,
      );
      throw new Error(`Video download failed: ${errorMessage}`);
    }
  }

  /**
   * Validate video buffer
   * Checks file size and format using magic bytes
   * Note: Duration validation would require ffmpeg/ffprobe
   * @param buffer - Video buffer
   * @param isVerified - Whether the account is verified (affects size/duration limits)
   * @returns Validation result
   */
  validateVideoBuffer(
    buffer: Buffer,
    isVerified: boolean = false,
  ): {
    valid: boolean;
    size: number;
    format?: string;
    errors?: string[];
  } {
    const errors: string[] = [];
    const size = buffer.length;

    // Check if buffer is empty
    if (size === 0) {
      errors.push('Video buffer is empty');
      return { valid: false, size, errors };
    }

    // Check file size limits
    const maxSize = isVerified
      ? this.MAX_VIDEO_SIZE_VERIFIED
      : this.MAX_VIDEO_SIZE_DEFAULT;

    if (size > maxSize) {
      const maxSizeGB = (maxSize / 1024 / 1024 / 1024).toFixed(0);
      const actualSizeGB = (size / 1024 / 1024 / 1024).toFixed(2);
      errors.push(
        `Video size (${actualSizeGB}GB) exceeds maximum (${maxSizeGB}GB) for ${isVerified ? 'verified' : 'unverified'} accounts`,
      );
    }

    // Validate file format using magic bytes
    const formatValidation = this.detectVideoFormat(buffer);
    if (!formatValidation.valid) {
      this.logger.warn(
        'Could not validate video format from magic bytes. YouTube will validate during upload.',
      );
    }

    const valid = errors.length === 0;

    return {
      valid,
      size,
      format: formatValidation.format,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Detect video format from buffer using magic bytes
   * @param buffer - Video buffer
   * @returns Format detection result
   */
  private detectVideoFormat(buffer: Buffer): {
    valid: boolean;
    format?: string;
  } {
    if (buffer.length < 12) {
      return { valid: false };
    }

    // Check first 12 bytes for known video signatures
    const headerHex = buffer.slice(0, 12).toString('hex');

    for (const { signature, offset, name } of this.VIDEO_SIGNATURES) {
      const startPos = offset * 2; // Each byte = 2 hex chars
      const endPos = startPos + signature.length;
      const chunk = headerHex.slice(startPos, endPos);

      if (chunk === signature) {
        this.logger.log(`Detected video format: ${name}`);
        return { valid: true, format: name };
      }
    }

    // Try to detect by common patterns
    if (headerHex.includes('667479706d703432')) {
      return { valid: true, format: 'MP4 (MPEG-4)' };
    }

    return { valid: false };
  }

  /**
   * Validate media attachment for YouTube
   * @param media - Media attachments array
   * @returns Validation result
   */
  validateMedia(media?: MediaAttachment[]): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // YouTube requires exactly one video
    if (!media || media.length === 0) {
      errors.push('YouTube posting requires exactly one video attachment');
      return { valid: false, errors };
    }

    if (media.length > 1) {
      errors.push('YouTube only supports one video per upload');
      return { valid: false, errors };
    }

    const attachment = media[0];

    // Must be a video
    if (attachment.type !== 'video') {
      errors.push('YouTube only supports video uploads, not images');
    }

    // Validate URL format
    if (!attachment.url || !this.isValidUrl(attachment.url)) {
      errors.push('Invalid video URL provided');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate URL format
   */
  private isValidUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  /**
   * Get recommended video specifications info
   */
  getVideoSpecs(isVerified: boolean = false): {
    maxSize: string;
    maxDuration: string;
    recommendedFormats: string[];
    recommendedResolution: string;
    recommendedAspectRatio: string;
  } {
    const maxSize = isVerified
      ? '256GB'
      : '128GB';

    const maxDuration = isVerified
      ? '12 hours'
      : '15 minutes';

    return {
      maxSize,
      maxDuration,
      recommendedFormats: ['MP4', 'MOV', 'AVI', 'WMV', 'FLV', '3GP', 'WebM'],
      recommendedResolution: '1920x1080 (1080p)',
      recommendedAspectRatio: '16:9',
    };
  }
}
