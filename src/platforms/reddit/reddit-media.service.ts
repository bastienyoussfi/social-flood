import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MediaAttachment,
  ValidationResult,
} from '../../common/interfaces/platform.interface';
import {
  RedditMediaAssetResponse,
  RedditMediaType,
  RedditMediaUploadResult,
} from './interfaces/reddit-api.interface';
import { getErrorMessage, getErrorStack } from '../../common/utils/error.utils';

/**
 * Reddit Media Service
 * Handles media upload to Reddit using their S3-based upload flow
 * Process: Request asset -> Upload to S3 -> Return media URL
 */
@Injectable()
export class RedditMediaService {
  private readonly logger = new Logger(RedditMediaService.name);
  private readonly userAgent: string;

  // Supported media types
  private readonly SUPPORTED_MIMETYPES: Set<RedditMediaType> = new Set([
    'image/png',
    'image/jpeg',
    'image/gif',
    'video/mp4',
    'video/quicktime',
  ]);

  // Media constraints
  private readonly MAX_IMAGE_SIZE = 20 * 1024 * 1024; // 20MB
  private readonly MAX_VIDEO_SIZE = 1024 * 1024 * 1024; // 1GB

  constructor(private readonly configService: ConfigService) {
    this.userAgent = this.configService.get<string>('REDDIT_USER_AGENT') || '';
  }

  /**
   * Validate media attachments against Reddit requirements
   * @param media - Array of media attachments to validate
   * @returns Validation result with any errors
   */
  validateMedia(media: MediaAttachment[]): ValidationResult {
    const errors: string[] = [];

    if (media.length === 0) {
      return { valid: true };
    }

    // Reddit supports multiple images in a gallery, but for simplicity
    // we'll start with single media support
    if (media.length > 1) {
      errors.push('Reddit integration currently supports only one media attachment per post');
    }

    for (const item of media) {
      // Check if type is supported
      if (item.type !== 'image' && item.type !== 'video') {
        errors.push(`Unsupported media type: ${item.type}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Request a media asset upload URL from Reddit
   * @param filepath - Filename for the media
   * @param mimetype - MIME type of the media
   * @param accessToken - Reddit OAuth2 access token
   * @returns Media asset response with S3 upload details
   */
  private async requestMediaAsset(
    filepath: string,
    mimetype: RedditMediaType,
    accessToken: string,
  ): Promise<RedditMediaAssetResponse> {
    try {
      this.logger.log(`Requesting media asset for ${filepath}`);

      const response = await fetch('https://oauth.reddit.com/api/media/asset.json', {
        method: 'POST',
        headers: {
          'Authorization': `bearer ${accessToken}`,
          'User-Agent': this.userAgent,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          filepath: filepath,
          mimetype: mimetype,
        }).toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Media asset request failed (${response.status}): ${errorText}`,
        );
      }

      const data: RedditMediaAssetResponse = await response.json();

      this.logger.log(
        `Media asset requested successfully. Asset ID: ${data.asset.asset_id}`,
      );

      return data;
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      const errorStack = getErrorStack(error);

      this.logger.error(
        `Failed to request media asset: ${errorMessage}`,
        errorStack,
      );

      throw new Error(`Reddit media asset request failed: ${errorMessage}`);
    }
  }

  /**
   * Download media from URL
   * @param url - Media URL to download
   * @returns Media buffer and content type
   */
  private async downloadMedia(
    url: string,
  ): Promise<{ buffer: Buffer; contentType: string }> {
    try {
      this.logger.log(`Downloading media from ${url}`);

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(
          `Failed to download media (${response.status}): ${response.statusText}`,
        );
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const contentType = response.headers.get('content-type') || 'application/octet-stream';

      this.logger.log(
        `Media downloaded successfully. Size: ${buffer.length} bytes, Type: ${contentType}`,
      );

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
   * Upload media to S3 using the provided upload URL and fields
   * @param uploadUrl - S3 upload URL from media asset response
   * @param fields - Form fields required by S3
   * @param fileBuffer - Media file buffer
   * @param filename - Original filename
   * @returns Uploaded media URL
   */
  private async uploadToS3(
    uploadUrl: string,
    fields: Array<{ name: string; value: string }>,
    fileBuffer: Buffer,
    filename: string,
  ): Promise<string> {
    try {
      this.logger.log(`Uploading media to S3: ${filename}`);

      // Create multipart form data
      const formData = new FormData();

      // Add all fields from Reddit's response
      for (const field of fields) {
        formData.append(field.name, field.value);
      }

      // Add the file as a blob
      const blob = new Blob([fileBuffer]);
      formData.append('file', blob, filename);

      const response = await fetch(uploadUrl, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `S3 upload failed (${response.status}): ${errorText}`,
        );
      }

      // The uploaded media URL is typically the action URL plus the key
      // We can extract it from the Location header or construct it
      const location = response.headers.get('Location');
      const mediaUrl = location || uploadUrl;

      this.logger.log(`Media uploaded successfully to: ${mediaUrl}`);

      return mediaUrl;
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      const errorStack = getErrorStack(error);

      this.logger.error(
        `Failed to upload to S3: ${errorMessage}`,
        errorStack,
      );

      throw new Error(`S3 upload failed: ${errorMessage}`);
    }
  }

  /**
   * Determine MIME type from media type and content type
   * @param mediaType - Media type from attachment
   * @param contentType - Content type from HTTP response
   * @returns Reddit-compatible MIME type
   */
  private determineMimeType(
    mediaType: 'image' | 'video',
    contentType: string,
  ): RedditMediaType {
    // Map content types to Reddit-supported MIME types
    const mimeTypeMap: Record<string, RedditMediaType> = {
      'image/png': 'image/png',
      'image/jpeg': 'image/jpeg',
      'image/jpg': 'image/jpeg',
      'image/gif': 'image/gif',
      'video/mp4': 'video/mp4',
      'video/quicktime': 'video/quicktime',
    };

    const mimeType = mimeTypeMap[contentType.toLowerCase()];

    if (!mimeType) {
      // Default based on media type
      return mediaType === 'video' ? 'video/mp4' : 'image/jpeg';
    }

    return mimeType;
  }

  /**
   * Upload media attachments to Reddit
   * Handles the full upload flow: download -> request asset -> upload to S3
   * @param media - Array of media attachments
   * @param accessToken - Reddit OAuth2 access token
   * @returns Array of uploaded media URLs
   */
  async uploadMedia(
    media: MediaAttachment[],
    accessToken: string,
  ): Promise<RedditMediaUploadResult[]> {
    try {
      this.logger.log(`Processing ${media.length} media attachment(s)`);

      const uploadResults: RedditMediaUploadResult[] = [];

      for (const item of media) {
        // Download media from URL
        const { buffer, contentType } = await this.downloadMedia(item.url);

        // Determine MIME type
        const mimeType = this.determineMimeType(item.type, contentType);

        if (!this.SUPPORTED_MIMETYPES.has(mimeType)) {
          throw new Error(`Unsupported MIME type: ${mimeType}`);
        }

        // Generate filename
        const extension = mimeType.split('/')[1];
        const filename = `upload_${Date.now()}.${extension}`;

        // Request media asset from Reddit
        const assetResponse = await this.requestMediaAsset(
          filename,
          mimeType,
          accessToken,
        );

        // Upload to S3
        const mediaUrl = await this.uploadToS3(
          assetResponse.args.action,
          assetResponse.args.fields,
          buffer,
          filename,
        );

        uploadResults.push({
          url: mediaUrl,
          assetId: assetResponse.asset.asset_id,
        });

        this.logger.log(
          `Media uploaded successfully. Asset ID: ${assetResponse.asset.asset_id}`,
        );
      }

      return uploadResults;
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      const errorStack = getErrorStack(error);

      this.logger.error(
        `Failed to upload media: ${errorMessage}`,
        errorStack,
      );

      throw new Error(`Reddit media upload failed: ${errorMessage}`);
    }
  }
}
