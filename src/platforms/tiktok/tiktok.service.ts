import { Injectable, Logger } from '@nestjs/common';
import { PostContent } from '../../common/interfaces';
import { TikTokApiClient } from './tiktok-api.client';
import { TikTokMediaService } from './tiktok-media.service';
import { TikTokAuthService } from '../../auth/tiktok-auth.service';
import {
  TikTokDirectPostInitRequest,
  TikTokPublishStatusResponse,
} from './interfaces';
import { getErrorMessage, getErrorStack } from '../../common/utils/error.utils';

/**
 * TikTok Service
 * Orchestrates the process of posting videos to TikTok
 * Coordinates between API client and media service
 */
@Injectable()
export class TikTokService {
  private readonly logger = new Logger(TikTokService.name);

  // Polling configuration
  private readonly POLL_INTERVAL_MS = 10000; // 10 seconds
  private readonly MAX_POLL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

  constructor(
    private readonly apiClient: TikTokApiClient,
    private readonly mediaService: TikTokMediaService,
    private readonly authService: TikTokAuthService,
  ) {}

  /**
   * Publish a video post to TikTok
   * Handles video upload with chunking and status polling
   * @param content - Post content with text and video
   * @returns Publish ID and URL
   */
  async publishPost(content: PostContent): Promise<{
    platformPostId: string;
    url: string;
  }> {
    try {
      this.logger.log('Starting TikTok video publication');

      // Get TikTok user ID from metadata
      const tiktokUserId = content.metadata?.tiktokUserId as string | undefined;

      // Get access token (from user auth or env)
      let accessToken: string | undefined;

      if (tiktokUserId) {
        // Use OAuth token from database
        this.logger.log(`Using OAuth token for user: ${tiktokUserId}`);
        accessToken = await this.authService.getValidAccessToken(tiktokUserId);
      } else {
        // Fall back to static token from environment
        this.logger.log('Using static token from environment');
        accessToken = this.apiClient.getAccessToken();

        if (!accessToken) {
          throw new Error(
            'TikTok authentication required. Please provide tiktokUserId or configure TIKTOK_ACCESS_TOKEN.',
          );
        }
      }

      // Validate content
      this.validateContent(content);

      // Step 1: Get creator info to check max video duration
      this.logger.log('Fetching creator information');
      const creatorInfo = await this.apiClient.getCreatorInfo(accessToken);

      if (!creatorInfo.data) {
        throw new Error('Failed to retrieve creator information from TikTok');
      }

      const maxDuration = creatorInfo.data.max_video_post_duration_sec;
      this.logger.log(`Creator max video duration: ${maxDuration}s`);

      // Step 2: Download video
      const videoUrl = content.media![0].url;
      this.logger.log(`Downloading video from: ${videoUrl}`);
      const videoBuffer = await this.mediaService.downloadVideo(videoUrl);

      // Step 3: Validate video
      const validation = this.mediaService.validateVideoBuffer(videoBuffer);
      if (!validation.valid) {
        throw new Error(
          `Video validation failed: ${validation.errors?.join(', ')}`,
        );
      }

      const videoSize = validation.size;
      this.logger.log(`Video size: ${(videoSize / 1024 / 1024).toFixed(2)} MB`);

      // Step 4: Calculate chunks
      const { chunkSize, totalChunks } =
        this.apiClient.calculateChunks(videoSize);

      // Step 5: Initialize direct post
      this.logger.log('Initializing TikTok direct post');
      const initRequest: TikTokDirectPostInitRequest = {
        post_info: {
          title: content.text || undefined,
          privacy_level: 'PUBLIC_TO_EVERYONE',
          disable_comment: false,
          disable_duet: false,
          disable_stitch: false,
        },
        source_info: {
          source: 'FILE_UPLOAD',
          video_size: videoSize,
          chunk_size: chunkSize,
          total_chunk_count: totalChunks,
        },
      };

      const initResult = await this.apiClient.initializeDirectPost(
        initRequest,
        accessToken,
      );

      if (!initResult.data) {
        throw new Error('Failed to initialize TikTok video upload');
      }

      const publishId = initResult.data.publish_id;
      const uploadUrl = initResult.data.upload_url;

      this.logger.log(`Upload initialized. Publish ID: ${publishId}`);

      // Step 6: Upload video in chunks
      this.logger.log('Starting video upload');
      await this.mediaService.uploadVideoChunked(uploadUrl, videoBuffer);

      // Step 7: Poll for publish status
      this.logger.log('Video uploaded. Polling for publish status...');
      const finalStatus = await this.pollPublishStatus(publishId, accessToken);

      if (!finalStatus.data) {
        throw new Error('Failed to get final publish status from TikTok');
      }

      // Check final status
      if (finalStatus.data.status === 'PUBLISH_FAILED') {
        throw new Error(
          `TikTok publish failed: ${finalStatus.data.fail_reason || 'Unknown reason'}`,
        );
      }

      if (finalStatus.data.status !== 'PUBLISH_COMPLETE') {
        this.logger.warn(
          `TikTok publish finished with status: ${finalStatus.data.status}`,
        );
      }

      // TikTok may not return a direct URL immediately
      // The publish_id can be used to track the post
      const url =
        finalStatus.data.downloadUrl ||
        `https://www.tiktok.com/@user/video/${publishId}`;

      this.logger.log(
        `TikTok video published successfully. Publish ID: ${publishId}`,
      );

      return {
        platformPostId: publishId,
        url,
      };
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      const errorStack = getErrorStack(error);

      this.logger.error(
        `Failed to publish to TikTok: ${errorMessage}`,
        errorStack,
      );

      // Re-throw with context
      throw new Error(`TikTok posting failed: ${errorMessage}`);
    }
  }

  /**
   * Poll TikTok publish status until complete or failed
   * @param publishId - Publish ID from initialization
   * @param accessToken - Access token for API calls
   * @returns Final status response
   */
  private async pollPublishStatus(
    publishId: string,
    accessToken: string,
  ): Promise<TikTokPublishStatusResponse> {
    const startTime = Date.now();
    let attempts = 0;

    while (Date.now() - startTime < this.MAX_POLL_TIMEOUT_MS) {
      attempts++;

      try {
        const status = await this.apiClient.getPublishStatus(
          publishId,
          accessToken,
        );

        if (!status.data) {
          throw new Error('Invalid status response from TikTok');
        }

        this.logger.log(`Status check #${attempts}: ${status.data.status}`);

        // Check if processing is complete
        if (
          status.data.status === 'PUBLISH_COMPLETE' ||
          status.data.status === 'PUBLISH_FAILED'
        ) {
          return status;
        }

        // Continue polling for other statuses:
        // PROCESSING_UPLOAD, SEND_TO_USER_INBOX, PROCESSING_DOWNLOAD
        this.logger.log(
          `Waiting ${this.POLL_INTERVAL_MS / 1000}s before next check...`,
        );
        await this.sleep(this.POLL_INTERVAL_MS);
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        this.logger.error(
          `Error polling status (attempt ${attempts}): ${errorMessage}`,
        );

        // Wait before retrying
        await this.sleep(this.POLL_INTERVAL_MS);
      }
    }

    // Timeout reached
    throw new Error(
      `TikTok publish status polling timeout after ${this.MAX_POLL_TIMEOUT_MS / 1000}s`,
    );
  }

  /**
   * Sleep for specified milliseconds
   * @param ms - Milliseconds to sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Validate post content for TikTok requirements
   */
  private validateContent(content: PostContent): void {
    // TikTok requires video
    if (!content.media || content.media.length === 0) {
      throw new Error('Video is required for TikTok posts');
    }

    // Validate media
    const mediaValidation = this.mediaService.validateMedia(content.media[0]);
    if (!mediaValidation.valid) {
      throw new Error(
        `Media validation failed: ${mediaValidation.errors.join(', ')}`,
      );
    }

    // Validate caption length
    const MAX_CAPTION_LENGTH = 2200;
    if (content.text && content.text.length > MAX_CAPTION_LENGTH) {
      throw new Error(
        `Caption exceeds ${MAX_CAPTION_LENGTH} characters. Got: ${content.text.length}`,
      );
    }
  }

  /**
   * Check if the TikTok integration is ready
   * Useful for health checks
   */
  isReady(): boolean {
    return this.apiClient.isConfigured();
  }
}
