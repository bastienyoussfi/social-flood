import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InstagramOAuthService } from '../../auth/services/instagram-oauth.service';
import {
  InstagramMediaContainerResponse,
  InstagramMediaStatusResponse,
  InstagramMediaPublishResponse,
  InstagramMedia,
  InstagramApiError,
  CreateMediaContainerParams,
  PublishMediaParams,
  InstagramPostResult,
  MediaContainerStatus,
} from './interfaces';
import { getErrorMessage, getErrorStack } from '../../common/utils/error.utils';

/**
 * Instagram API Client
 * Handles all Graph API calls for Instagram content publishing
 */
@Injectable()
export class InstagramApiClient {
  private readonly logger = new Logger(InstagramApiClient.name);
  private readonly apiVersion: string;
  private readonly baseUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly instagramOAuthService: InstagramOAuthService,
  ) {
    this.apiVersion = 'v18.0';
    this.baseUrl = `https://graph.facebook.com/${this.apiVersion}`;
  }

  /**
   * Check if the client is properly configured
   */
  isConfigured(): boolean {
    return this.instagramOAuthService.isConfigured();
  }

  /**
   * Create a media container for a single image or video
   */
  async createMediaContainer(
    params: CreateMediaContainerParams,
  ): Promise<string> {
    try {
      this.logger.log(
        `Creating media container for IG user: ${params.igUserId}`,
      );

      const formData = new URLSearchParams();

      if (params.imageUrl) {
        formData.append('image_url', params.imageUrl);
      }

      if (params.videoUrl) {
        formData.append('video_url', params.videoUrl);
        formData.append('media_type', params.mediaType || 'VIDEO');
      }

      if (params.caption) {
        formData.append('caption', params.caption);
      }

      if (params.locationId) {
        formData.append('location_id', params.locationId);
      }

      if (params.userTags && params.userTags.length > 0) {
        formData.append('user_tags', JSON.stringify(params.userTags));
      }

      if (params.mediaType === 'REELS') {
        formData.append('media_type', 'REELS');
        if (params.coverUrl) {
          formData.append('cover_url', params.coverUrl);
        }
        if (params.shareToFeed !== undefined) {
          formData.append('share_to_feed', String(params.shareToFeed));
        }
      }

      formData.append('access_token', params.accessToken);

      const response = await fetch(`${this.baseUrl}/${params.igUserId}/media`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      });

      const data = (await response.json()) as
        | InstagramMediaContainerResponse
        | InstagramApiError;

      if (!response.ok) {
        const error = data as InstagramApiError;
        throw new Error(
          `Failed to create media container: ${error.error?.message || 'Unknown error'}`,
        );
      }

      const containerResponse = data as InstagramMediaContainerResponse;
      this.logger.log(`Media container created: ${containerResponse.id}`);

      return containerResponse.id;
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      const errorStack = getErrorStack(error);
      this.logger.error(
        `Failed to create media container: ${errorMessage}`,
        errorStack,
      );
      throw error;
    }
  }

  /**
   * Check the status of a media container
   */
  async getContainerStatus(
    containerId: string,
    accessToken: string,
  ): Promise<MediaContainerStatus> {
    try {
      const response = await fetch(
        `${this.baseUrl}/${containerId}?fields=status_code&access_token=${accessToken}`,
      );

      const data = (await response.json()) as
        | InstagramMediaStatusResponse
        | InstagramApiError;

      if (!response.ok) {
        const error = data as InstagramApiError;
        throw new Error(
          `Failed to get container status: ${error.error?.message || 'Unknown error'}`,
        );
      }

      const statusResponse = data as InstagramMediaStatusResponse;
      return statusResponse.status_code;
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      this.logger.error(`Failed to get container status: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Wait for media container to be ready
   */
  async waitForContainerReady(
    containerId: string,
    accessToken: string,
    maxAttempts: number = 30,
    delayMs: number = 2000,
  ): Promise<void> {
    this.logger.log(`Waiting for container ${containerId} to be ready...`);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const status = await this.getContainerStatus(containerId, accessToken);

      this.logger.log(`Container status (attempt ${attempt}): ${status}`);

      if (status === 'FINISHED') {
        this.logger.log('Container is ready for publishing');
        return;
      }

      if (status === 'ERROR' || status === 'EXPIRED') {
        throw new Error(`Media container failed with status: ${status}`);
      }

      if (status === 'PUBLISHED') {
        this.logger.log('Container is already published');
        return;
      }

      // IN_PROGRESS - wait and retry
      if (attempt < maxAttempts) {
        await this.delay(delayMs);
      }
    }

    throw new Error(
      `Media container did not become ready after ${maxAttempts} attempts`,
    );
  }

  /**
   * Publish a media container
   */
  async publishMedia(params: PublishMediaParams): Promise<string> {
    try {
      this.logger.log(`Publishing media container: ${params.creationId}`);

      const formData = new URLSearchParams();
      formData.append('creation_id', params.creationId);
      formData.append('access_token', params.accessToken);

      const response = await fetch(
        `${this.baseUrl}/${params.igUserId}/media_publish`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: formData.toString(),
        },
      );

      const data = (await response.json()) as
        | InstagramMediaPublishResponse
        | InstagramApiError;

      if (!response.ok) {
        const error = data as InstagramApiError;
        throw new Error(
          `Failed to publish media: ${error.error?.message || 'Unknown error'}`,
        );
      }

      const publishResponse = data as InstagramMediaPublishResponse;
      this.logger.log(`Media published successfully: ${publishResponse.id}`);

      return publishResponse.id;
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      const errorStack = getErrorStack(error);
      this.logger.error(`Failed to publish media: ${errorMessage}`, errorStack);
      throw error;
    }
  }

  /**
   * Get media details including permalink
   */
  async getMediaDetails(
    mediaId: string,
    accessToken: string,
  ): Promise<InstagramMedia> {
    try {
      const response = await fetch(
        `${this.baseUrl}/${mediaId}?fields=id,media_type,media_url,permalink,caption,timestamp,username&access_token=${accessToken}`,
      );

      const data = (await response.json()) as
        | InstagramMedia
        | InstagramApiError;

      if (!response.ok) {
        const error = data as InstagramApiError;
        throw new Error(
          `Failed to get media details: ${error.error?.message || 'Unknown error'}`,
        );
      }

      return data as InstagramMedia;
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      this.logger.error(`Failed to get media details: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Create and publish a post (full flow)
   */
  async createPost(
    igUserId: string,
    accessToken: string,
    imageUrl: string,
    caption?: string,
  ): Promise<InstagramPostResult> {
    try {
      this.logger.log(`Creating Instagram post for user: ${igUserId}`);

      // Step 1: Create media container
      const containerId = await this.createMediaContainer({
        igUserId,
        accessToken,
        imageUrl,
        caption,
      });

      // Step 2: Wait for container to be ready (for videos, this may take time)
      await this.waitForContainerReady(containerId, accessToken);

      // Step 3: Publish the container
      const mediaId = await this.publishMedia({
        igUserId,
        accessToken,
        creationId: containerId,
      });

      // Step 4: Get the permalink
      const mediaDetails = await this.getMediaDetails(mediaId, accessToken);

      return {
        postId: mediaId,
        url: mediaDetails.permalink || `https://www.instagram.com/p/${mediaId}`,
      };
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      const errorStack = getErrorStack(error);
      this.logger.error(
        `Failed to create Instagram post: ${errorMessage}`,
        errorStack,
      );
      throw error;
    }
  }

  /**
   * Create and publish a video post
   */
  async createVideoPost(
    igUserId: string,
    accessToken: string,
    videoUrl: string,
    caption?: string,
    isReel: boolean = false,
  ): Promise<InstagramPostResult> {
    try {
      this.logger.log(
        `Creating Instagram ${isReel ? 'Reel' : 'video'} post for user: ${igUserId}`,
      );

      // Step 1: Create media container
      const containerId = await this.createMediaContainer({
        igUserId,
        accessToken,
        videoUrl,
        caption,
        mediaType: isReel ? 'REELS' : 'VIDEO',
        shareToFeed: isReel ? true : undefined,
      });

      // Step 2: Wait for container to be ready (videos take longer to process)
      await this.waitForContainerReady(containerId, accessToken, 60, 5000);

      // Step 3: Publish the container
      const mediaId = await this.publishMedia({
        igUserId,
        accessToken,
        creationId: containerId,
      });

      // Step 4: Get the permalink
      const mediaDetails = await this.getMediaDetails(mediaId, accessToken);

      return {
        postId: mediaId,
        url: mediaDetails.permalink || `https://www.instagram.com/p/${mediaId}`,
      };
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      const errorStack = getErrorStack(error);
      this.logger.error(
        `Failed to create Instagram video post: ${errorMessage}`,
        errorStack,
      );
      throw error;
    }
  }

  /**
   * Helper delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
