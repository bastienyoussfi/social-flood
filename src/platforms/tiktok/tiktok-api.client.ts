import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  TikTokConfig,
  TikTokCreatorInfoResponse,
  TikTokDirectPostInitRequest,
  TikTokDirectPostInitResponse,
  TikTokPublishStatusRequest,
  TikTokPublishStatusResponse,
  TIKTOK_API_BASE_URL,
  TIKTOK_API_VERSION,
} from './interfaces';
import { getErrorMessage, getErrorStack } from '../../common/utils/error.utils';

/**
 * TikTok API Client
 * Handles all direct communication with TikTok Content Posting API v2
 * Uses OAuth 2.0 for authentication
 */
@Injectable()
export class TikTokApiClient {
  private readonly logger = new Logger(TikTokApiClient.name);
  private readonly config: TikTokConfig;

  constructor(private readonly configService: ConfigService) {
    this.config = this.loadConfig();
    this.validateConfig();
  }

  /**
   * Load TikTok configuration from environment
   */
  private loadConfig(): TikTokConfig {
    const clientKey = this.configService.get<string>('TIKTOK_CLIENT_KEY') || '';
    const clientSecret =
      this.configService.get<string>('TIKTOK_CLIENT_SECRET') || '';
    const accessToken =
      this.configService.get<string>('TIKTOK_ACCESS_TOKEN') || '';
    const refreshToken = this.configService.get<string>('TIKTOK_REFRESH_TOKEN');

    return {
      clientKey,
      clientSecret,
      accessToken,
      refreshToken,
      apiBaseUrl: TIKTOK_API_BASE_URL,
    };
  }

  /**
   * Validate required configuration
   */
  private validateConfig(): void {
    if (!this.config.clientKey || !this.config.clientSecret) {
      throw new Error(
        'TikTok OAuth credentials are not properly configured. ' +
          'Please set TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET',
      );
    }

    if (!this.config.accessToken) {
      this.logger.warn(
        'TIKTOK_ACCESS_TOKEN is not set. You will need to implement OAuth 2.0 flow to obtain an access token.',
      );
    }

    this.logger.log('TikTok API client initialized successfully');
  }

  /**
   * Get creator information including max video duration
   * GET /v2/post/publish/creator_info/query/
   */
  async getCreatorInfo(): Promise<TikTokCreatorInfoResponse> {
    try {
      this.logger.log('Fetching TikTok creator info');

      if (!this.config.accessToken) {
        throw new Error('TikTok access token is not configured');
      }

      const response = await fetch(
        `${this.config.apiBaseUrl}/${TIKTOK_API_VERSION}/post/publish/creator_info/query/`,
        {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify({}),
        },
      );

      const data = (await response.json()) as TikTokCreatorInfoResponse;

      if (!response.ok || data.error) {
        throw new Error(
          `TikTok API error: ${data.error?.message || response.statusText}`,
        );
      }

      this.logger.log(
        `Creator info retrieved: max duration ${data.data?.max_video_post_duration_sec}s`,
      );

      return data;
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      this.logger.error('Failed to get creator info', getErrorStack(error));
      throw new Error(`Failed to get TikTok creator info: ${errorMessage}`);
    }
  }

  /**
   * Initialize direct post video upload
   * POST /v2/post/publish/video/init/
   */
  async initializeDirectPost(
    request: TikTokDirectPostInitRequest,
  ): Promise<TikTokDirectPostInitResponse> {
    try {
      this.logger.log('Initializing TikTok direct post upload');

      if (!this.config.accessToken) {
        throw new Error('TikTok access token is not configured');
      }

      const response = await fetch(
        `${this.config.apiBaseUrl}/${TIKTOK_API_VERSION}/post/publish/video/init/`,
        {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify(request),
        },
      );

      const data = (await response.json()) as TikTokDirectPostInitResponse;

      if (!response.ok || data.error) {
        throw new Error(
          `TikTok API error: ${data.error?.message || response.statusText}`,
        );
      }

      this.logger.log(
        `Upload initialized: publish_id=${data.data?.publish_id}`,
      );

      return data;
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      this.logger.error(
        'Failed to initialize direct post',
        getErrorStack(error),
      );
      throw new Error(`Failed to initialize TikTok upload: ${errorMessage}`);
    }
  }

  /**
   * Upload video chunk to TikTok
   * PUT to the upload_url provided by initializeDirectPost
   */
  async uploadVideoChunk(
    uploadUrl: string,
    chunk: Buffer,
    contentRange: string,
    contentLength: number,
  ): Promise<void> {
    try {
      this.logger.log(`Uploading chunk: ${contentRange}`);

      const response = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Range': contentRange,
          'Content-Length': contentLength.toString(),
        },
        body: chunk as unknown as BodyInit,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Chunk upload failed (${response.status}): ${errorText}`,
        );
      }

      this.logger.log(`Chunk uploaded successfully: ${contentRange}`);
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      this.logger.error('Failed to upload video chunk', getErrorStack(error));
      throw new Error(`Failed to upload video chunk: ${errorMessage}`);
    }
  }

  /**
   * Check publish status
   * POST /v2/post/publish/status/fetch/
   */
  async getPublishStatus(
    publishId: string,
  ): Promise<TikTokPublishStatusResponse> {
    try {
      if (!this.config.accessToken) {
        throw new Error('TikTok access token is not configured');
      }

      const requestBody: TikTokPublishStatusRequest = {
        publish_id: publishId,
      };

      const response = await fetch(
        `${this.config.apiBaseUrl}/${TIKTOK_API_VERSION}/post/publish/status/fetch/`,
        {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify(requestBody),
        },
      );

      const data = (await response.json()) as TikTokPublishStatusResponse;

      if (!response.ok || data.error) {
        throw new Error(
          `TikTok API error: ${data.error?.message || response.statusText}`,
        );
      }

      this.logger.log(`Status: ${data.data?.status}`);

      return data;
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      this.logger.error('Failed to get publish status', getErrorStack(error));
      throw new Error(`Failed to get TikTok publish status: ${errorMessage}`);
    }
  }

  /**
   * Calculate chunk sizes for video upload
   * TikTok requirements:
   * - < 5MB: single chunk (chunk_size = total size)
   * - >= 5MB: multiple chunks (5-64MB per chunk, max 1000 chunks)
   */
  calculateChunks(fileSize: number): {
    chunkSize: number;
    totalChunks: number;
  } {
    const MIN_CHUNK_SIZE = 5 * 1024 * 1024; // 5MB
    const MAX_CHUNK_SIZE = 64 * 1024 * 1024; // 64MB
    const MAX_CHUNKS = 1000;

    // If file is smaller than 5MB, upload as single chunk
    if (fileSize < MIN_CHUNK_SIZE) {
      return {
        chunkSize: fileSize,
        totalChunks: 1,
      };
    }

    // Calculate optimal chunk size
    // Use 10MB chunks by default, but adjust if needed
    let chunkSize = 10 * 1024 * 1024; // 10MB

    // If file would require more than max chunks, increase chunk size
    if (fileSize / chunkSize > MAX_CHUNKS) {
      chunkSize = Math.ceil(fileSize / MAX_CHUNKS);
    }

    // Ensure chunk size is within limits
    chunkSize = Math.max(MIN_CHUNK_SIZE, Math.min(chunkSize, MAX_CHUNK_SIZE));

    const totalChunks = Math.ceil(fileSize / chunkSize);

    return {
      chunkSize,
      totalChunks,
    };
  }

  /**
   * Get standard headers for TikTok API requests
   */
  private getHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.config.accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Check if the client is properly configured
   */
  isConfigured(): boolean {
    return !!(
      this.config.clientKey &&
      this.config.clientSecret &&
      this.config.accessToken
    );
  }

  /**
   * Get access token
   */
  getAccessToken(): string | undefined {
    return this.config.accessToken;
  }
}
