import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  YoutubeConfig,
  YoutubeVideoMetadata,
  YoutubeUploadResponse,
  YoutubeVideoResource,
  YoutubeApiError,
  YoutubeOAuthTokens,
} from './interfaces';
import { getErrorMessage, getErrorStack } from '../../common/utils/error.utils';

const YOUTUBE_API_BASE_URL = 'https://www.googleapis.com/youtube/v3';
const YOUTUBE_UPLOAD_BASE_URL = 'https://www.googleapis.com/upload/youtube/v3';
const YOUTUBE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';

/**
 * YouTube API Client
 * Handles all direct communication with YouTube Data API v3
 * Uses OAuth 2.0 for authentication with token refresh capability
 */
@Injectable()
export class YoutubeApiClient {
  private readonly logger = new Logger(YoutubeApiClient.name);
  private config: YoutubeConfig;

  constructor(private readonly configService: ConfigService) {
    this.config = this.loadConfig();
    this.validateConfig();
  }

  /**
   * Load YouTube configuration from environment
   */
  private loadConfig(): YoutubeConfig {
    const clientId = this.configService.get<string>('YOUTUBE_CLIENT_ID') || '';
    const clientSecret = this.configService.get<string>('YOUTUBE_CLIENT_SECRET') || '';
    const accessToken = this.configService.get<string>('YOUTUBE_ACCESS_TOKEN') || '';
    const refreshToken = this.configService.get<string>('YOUTUBE_REFRESH_TOKEN') || '';

    return {
      clientId,
      clientSecret,
      accessToken,
      refreshToken,
    };
  }

  /**
   * Validate required configuration
   */
  private validateConfig(): void {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error(
        'YouTube OAuth credentials are not properly configured. ' +
          'Please set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET',
      );
    }

    if (!this.config.accessToken) {
      this.logger.warn(
        'YOUTUBE_ACCESS_TOKEN is not set. You will need to implement OAuth 2.0 flow to obtain an access token.',
      );
    }

    if (!this.config.refreshToken) {
      this.logger.warn(
        'YOUTUBE_REFRESH_TOKEN is not set. Token refresh will not be available.',
      );
    }

    this.logger.log('YouTube API client initialized successfully');
  }

  /**
   * Check if the API client is properly configured
   */
  isConfigured(): boolean {
    return !!(this.config.clientId && this.config.accessToken);
  }

  /**
   * Get authorization headers for API requests
   */
  private getHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.config.accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Refresh the access token using the refresh token
   */
  async refreshAccessToken(): Promise<void> {
    try {
      if (!this.config.refreshToken) {
        throw new Error('Refresh token not available');
      }

      this.logger.log('Refreshing YouTube access token');

      const response = await fetch(YOUTUBE_OAUTH_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          refresh_token: this.config.refreshToken,
          grant_type: 'refresh_token',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Failed to refresh token: ${JSON.stringify(errorData)}`);
      }

      const tokens: YoutubeOAuthTokens = await response.json();
      this.config.accessToken = tokens.access_token;

      this.logger.log('Access token refreshed successfully');
    } catch (error) {
      const message = getErrorMessage(error);
      const stack = getErrorStack(error);
      this.logger.error(`Failed to refresh access token: ${message}`, stack);
      throw new Error(`Token refresh failed: ${message}`);
    }
  }

  /**
   * Initialize resumable upload and get upload URL
   * POST /upload/youtube/v3/videos?uploadType=resumable&part=snippet,status
   */
  async initializeResumableUpload(
    metadata: YoutubeVideoMetadata,
  ): Promise<string> {
    try {
      this.logger.log(`Initializing resumable upload for video: ${metadata.title}`);

      if (!this.config.accessToken) {
        throw new Error('YouTube access token is not configured');
      }

      const requestBody = {
        snippet: {
          title: metadata.title,
          description: metadata.description || '',
          tags: metadata.tags || [],
          categoryId: metadata.categoryId || '22', // Default to "People & Blogs"
        },
        status: {
          privacyStatus: metadata.privacyStatus,
          madeForKids: metadata.madeForKids || false,
        },
      };

      const response = await fetch(
        `${YOUTUBE_UPLOAD_BASE_URL}/videos?uploadType=resumable&part=snippet,status`,
        {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify(requestBody),
        },
      );

      if (response.status === 401) {
        this.logger.warn('Access token expired, attempting refresh');
        await this.refreshAccessToken();
        return this.initializeResumableUpload(metadata);
      }

      if (!response.ok) {
        const errorData = await response.json() as YoutubeApiError;
        throw new Error(
          `YouTube API error: ${errorData.error?.message || response.statusText}`,
        );
      }

      const uploadUrl = response.headers.get('Location');
      if (!uploadUrl) {
        throw new Error('Upload URL not returned by YouTube API');
      }

      this.logger.log(`Resumable upload initialized. Upload URL obtained.`);
      return uploadUrl;
    } catch (error) {
      const message = getErrorMessage(error);
      const stack = getErrorStack(error);
      this.logger.error(`Failed to initialize resumable upload: ${message}`, stack);
      throw new Error(`Resumable upload initialization failed: ${message}`);
    }
  }

  /**
   * Upload video bytes to YouTube using resumable upload
   * PUT to upload URL
   */
  async uploadVideoBytes(
    uploadUrl: string,
    videoBuffer: Buffer,
  ): Promise<YoutubeUploadResponse> {
    try {
      this.logger.log(`Uploading video bytes (${videoBuffer.length} bytes)`);

      const response = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'video/*',
          'Content-Length': videoBuffer.length.toString(),
        },
        body: videoBuffer,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Video upload failed: ${response.status} ${response.statusText} - ${errorText}`,
        );
      }

      const result = await response.json() as YoutubeUploadResponse;

      this.logger.log(`Video uploaded successfully. Video ID: ${result.id}`);
      return result;
    } catch (error) {
      const message = getErrorMessage(error);
      const stack = getErrorStack(error);
      this.logger.error(`Failed to upload video bytes: ${message}`, stack);
      throw new Error(`Video upload failed: ${message}`);
    }
  }

  /**
   * Get video status to check processing completion
   * GET /youtube/v3/videos?part=status,snippet&id={videoId}
   */
  async getVideoStatus(videoId: string): Promise<YoutubeVideoResource> {
    try {
      this.logger.log(`Checking video status for ID: ${videoId}`);

      if (!this.config.accessToken) {
        throw new Error('YouTube access token is not configured');
      }

      const response = await fetch(
        `${YOUTUBE_API_BASE_URL}/videos?part=status,snippet&id=${videoId}`,
        {
          method: 'GET',
          headers: this.getHeaders(),
        },
      );

      if (response.status === 401) {
        this.logger.warn('Access token expired, attempting refresh');
        await this.refreshAccessToken();
        return this.getVideoStatus(videoId);
      }

      if (!response.ok) {
        const errorData = await response.json() as YoutubeApiError;
        throw new Error(
          `YouTube API error: ${errorData.error?.message || response.statusText}`,
        );
      }

      const data = await response.json();

      if (!data.items || data.items.length === 0) {
        throw new Error(`Video not found: ${videoId}`);
      }

      const video = data.items[0] as YoutubeVideoResource;
      this.logger.log(
        `Video status: upload=${video.status.uploadStatus}, processing=${video.status.processingStatus}`,
      );

      return video;
    } catch (error) {
      const message = getErrorMessage(error);
      const stack = getErrorStack(error);
      this.logger.error(`Failed to get video status: ${message}`, stack);
      throw new Error(`Video status check failed: ${message}`);
    }
  }

  /**
   * Poll video processing status until complete
   * Retries with exponential backoff
   */
  async waitForProcessing(
    videoId: string,
    maxAttempts: number = 20,
  ): Promise<YoutubeVideoResource> {
    let attempt = 0;
    const baseDelay = 5000; // Start with 5 seconds

    while (attempt < maxAttempts) {
      attempt++;

      try {
        const video = await this.getVideoStatus(videoId);

        // Check if processing is complete
        if (video.status.uploadStatus === 'processed') {
          this.logger.log(`Video processing completed for ID: ${videoId}`);
          return video;
        }

        // Check for failed status
        if (
          video.status.uploadStatus === 'failed' ||
          video.status.uploadStatus === 'rejected' ||
          video.status.processingStatus === 'failed' ||
          video.status.processingStatus === 'terminated'
        ) {
          throw new Error(
            `Video processing failed. Upload status: ${video.status.uploadStatus}, ` +
            `Processing status: ${video.status.processingStatus}`,
          );
        }

        // Still processing, wait before next attempt
        const delay = Math.min(baseDelay * Math.pow(1.5, attempt - 1), 60000); // Max 60s
        this.logger.log(
          `Video still processing (attempt ${attempt}/${maxAttempts}). ` +
          `Waiting ${delay}ms before next check...`,
        );

        await new Promise(resolve => setTimeout(resolve, delay));
      } catch (error) {
        if (attempt >= maxAttempts) {
          throw error;
        }
        this.logger.warn(`Status check failed (attempt ${attempt}), retrying...`);
        await new Promise(resolve => setTimeout(resolve, baseDelay));
      }
    }

    throw new Error(
      `Video processing timeout after ${maxAttempts} attempts. Video ID: ${videoId}`,
    );
  }

  /**
   * Get the watch URL for a video
   */
  getVideoUrl(videoId: string): string {
    return `https://www.youtube.com/watch?v=${videoId}`;
  }
}
