import { Injectable, Logger } from '@nestjs/common';
import { TikTokApiClient } from './tiktok-api.client';
import { MediaAttachment } from '../../common/interfaces';
import { getErrorMessage, getErrorStack } from '../../common/utils/error.utils';

/**
 * TikTok Media Service
 * Handles downloading videos from URLs and uploading to TikTok using chunked upload
 * Supports videos only (TikTok requirement)
 */
@Injectable()
export class TikTokMediaService {
  private readonly logger = new Logger(TikTokMediaService.name);

  // TikTok video requirements
  private readonly MAX_VIDEO_SIZE_SHORT = 500 * 1024 * 1024; // 500MB for videos < 3 min
  private readonly MAX_VIDEO_SIZE_LONG = 2 * 1024 * 1024 * 1024; // 2GB for 3-10 min videos
  private readonly MIN_VIDEO_DURATION = 3; // seconds
  private readonly MAX_VIDEO_DURATION = 600; // 10 minutes (600 seconds)

  // Supported video MIME types
  private readonly SUPPORTED_VIDEO_TYPES = [
    'video/mp4',
    'video/quicktime', // .mov files
    'video/webm',
  ];

  constructor(private readonly apiClient: TikTokApiClient) {}

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

      // Validate content type
      const contentType = response.headers.get('content-type');
      if (contentType && !this.SUPPORTED_VIDEO_TYPES.includes(contentType)) {
        this.logger.warn(
          `Potentially unsupported video type: ${contentType}. Proceeding anyway.`,
        );
      }

      // Convert to buffer
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      this.logger.log(
        `Downloaded ${(buffer.length / 1024 / 1024).toFixed(2)} MB`,
      );

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
   * Upload video to TikTok using chunked upload
   * @param uploadUrl - Upload URL from TikTok API
   * @param videoBuffer - Video data buffer
   */
  async uploadVideoChunked(
    uploadUrl: string,
    videoBuffer: Buffer,
  ): Promise<void> {
    try {
      const fileSize = videoBuffer.length;
      this.logger.log(
        `Starting chunked upload: ${(fileSize / 1024 / 1024).toFixed(2)} MB`,
      );

      const { chunkSize, totalChunks } =
        this.apiClient.calculateChunks(fileSize);

      this.logger.log(
        `Upload plan: ${totalChunks} chunk(s) of ~${(chunkSize / 1024 / 1024).toFixed(2)} MB each`,
      );

      // Upload each chunk
      for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, fileSize);
        const chunk = videoBuffer.slice(start, end);

        // Content-Range header format: bytes {start}-{end-1}/{total_size}
        const contentRange = `bytes ${start}-${end - 1}/${fileSize}`;

        this.logger.log(
          `Uploading chunk ${i + 1}/${totalChunks}: ${contentRange}`,
        );

        await this.apiClient.uploadVideoChunk(
          uploadUrl,
          chunk,
          contentRange,
          chunk.length,
        );

        // Log progress
        const progress = ((end / fileSize) * 100).toFixed(1);
        this.logger.log(`Upload progress: ${progress}%`);
      }

      this.logger.log('Video upload completed successfully');
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      const errorStack = getErrorStack(error);

      this.logger.error(`Failed to upload video: ${errorMessage}`, errorStack);
      throw new Error(`Video upload failed: ${errorMessage}`);
    }
  }

  /**
   * Validate video buffer (basic validation)
   * For more advanced validation (codec, duration, fps), would need a library like fluent-ffmpeg
   * @param buffer - Video buffer
   * @returns Validation result
   */
  validateVideoBuffer(buffer: Buffer): {
    valid: boolean;
    size: number;
    errors?: string[];
  } {
    const errors: string[] = [];
    const size = buffer.length;

    // Check if buffer is empty
    if (size === 0) {
      errors.push('Video buffer is empty');
    }

    // Check size limits (conservative check for videos < 3min)
    if (size > this.MAX_VIDEO_SIZE_SHORT) {
      this.logger.warn(
        `Video size ${(size / 1024 / 1024).toFixed(2)} MB exceeds 500MB limit for short videos`,
      );

      // Check if it's within long video limits
      if (size > this.MAX_VIDEO_SIZE_LONG) {
        errors.push(
          `Video size ${(size / 1024 / 1024).toFixed(2)} MB exceeds maximum 2GB limit`,
        );
      }
    }

    // Check MP4 signature (basic check)
    // MP4 files typically start with specific bytes
    const signature = buffer.slice(0, 12).toString('hex');
    if (
      !signature.includes('6674797069736f6d') && // 'ftypisom'
      !signature.includes('667479706d703432') && // 'ftypmp42'
      !signature.includes('667479704d534e56') && // 'ftypMSNV'
      !signature.includes('6674797071742020')
    ) {
      // 'ftypqt  '
      this.logger.warn('Video may not be a valid MP4/QuickTime file');
    }

    return {
      valid: errors.length === 0,
      size,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Validate media attachment for TikTok requirements
   * @param media - Media attachment
   * @returns Validation result
   */
  validateMedia(media: MediaAttachment): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!media) {
      errors.push('Media attachment is required for TikTok');
      return { valid: false, errors };
    }

    // TikTok only supports video
    if (media.type !== 'video') {
      errors.push(`TikTok only supports video posts. Got: ${media.type}`);
    }

    // Check URL
    if (!media.url) {
      errors.push('Video URL is required');
    } else {
      // Validate URL format
      try {
        new URL(media.url);
      } catch {
        errors.push(`Invalid video URL: ${media.url}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Estimate video duration from file size (very rough estimate)
   * For accurate duration, would need fluent-ffmpeg or similar library
   * Assumes ~8 Mbps bitrate
   * @param fileSize - File size in bytes
   * @returns Estimated duration in seconds
   */
  estimateVideoDuration(fileSize: number): number {
    const ESTIMATED_BITRATE = 8 * 1024 * 1024; // 8 Mbps in bits per second
    const fileSizeInBits = fileSize * 8;
    return Math.round(fileSizeInBits / ESTIMATED_BITRATE);
  }
}
