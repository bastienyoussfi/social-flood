import { Injectable, Logger } from '@nestjs/common';
import { PostContent } from '../../common/interfaces';
import { InstagramApiClient } from './instagram-api.client';
import { InstagramMediaService } from './instagram-media.service';
import { InstagramOAuthService } from '../../auth/services/instagram-oauth.service';
import { InstagramPostResult } from './interfaces';
import { getErrorMessage, getErrorStack } from '../../common/utils/error.utils';

/**
 * Instagram Service
 * Orchestrates the process of posting to Instagram
 * Coordinates between API client, media service, and OAuth service
 */
@Injectable()
export class InstagramService {
  private readonly logger = new Logger(InstagramService.name);

  constructor(
    private readonly apiClient: InstagramApiClient,
    private readonly mediaService: InstagramMediaService,
    private readonly oauthService: InstagramOAuthService,
  ) {}

  /**
   * Publish a post to Instagram
   * Handles text and media attachments
   * @param content - Post content with text and media
   * @returns Post ID and URL
   */
  async publishPost(content: PostContent): Promise<{
    platformPostId: string;
    url: string;
  }> {
    try {
      this.logger.log('Starting Instagram post publication');

      // Validate configuration
      if (!this.apiClient.isConfigured()) {
        throw new Error(
          'Instagram API is not properly configured. Please check your Meta App credentials (META_APP_ID, META_APP_SECRET).',
        );
      }

      // Validate content
      this.validateContent(content);

      // Get userId from metadata
      const userId = content.metadata?.userId as string | undefined;
      if (!userId) {
        throw new Error(
          'User ID is required for Instagram posting. Please provide userId in metadata.',
        );
      }

      // Get OAuth tokens
      const accessToken = await this.oauthService.getAccessToken(userId);
      if (!accessToken) {
        throw new Error(
          `Instagram authentication not found for user: ${userId}. Please connect your Instagram account first.`,
        );
      }

      const igUserId = await this.oauthService.getInstagramUserId(userId);
      if (!igUserId) {
        throw new Error(
          `Instagram Business Account not found for user: ${userId}. Please ensure your Instagram account is linked to a Facebook Page.`,
        );
      }

      // Step 1: Validate and process media
      if (!content.media || content.media.length === 0) {
        throw new Error(
          'Instagram posts require at least one image or video. Please provide media.',
        );
      }

      this.logger.log(`Processing ${content.media.length} media attachment(s)`);

      // Validate media
      const mediaValidation = this.mediaService.validateMedia(content.media);
      if (!mediaValidation.valid) {
        throw new Error(
          `Media validation failed: ${mediaValidation.errors.join(', ')}`,
        );
      }

      // Validate caption
      const captionValidation = this.mediaService.validateCaption(content.text);
      if (!captionValidation.valid) {
        this.logger.warn(
          `Caption validation warnings: ${captionValidation.errors.join(', ')}`,
        );
      }

      // Process media
      const mediaUrl = this.mediaService.processMedia(content.media);
      if (!mediaUrl) {
        throw new Error('Failed to process media for Instagram post');
      }

      this.logger.log(`Media processed successfully: ${mediaUrl}`);

      // Step 2: Prepare caption
      const caption = this.mediaService.truncateCaption(content.text);

      // Step 3: Determine media type and post
      const primaryMedia = content.media[0];
      let result: InstagramPostResult;

      if (this.mediaService.isVideo(primaryMedia)) {
        // Video post
        result = await this.apiClient.createVideoPost(
          igUserId,
          accessToken,
          mediaUrl,
          caption,
          false, // Not a Reel by default
        );
      } else {
        // Image post
        result = await this.apiClient.createPost(
          igUserId,
          accessToken,
          mediaUrl,
          caption,
        );
      }

      this.logger.log(
        `Instagram post published successfully. ID: ${result.postId}, URL: ${result.url}`,
      );

      return {
        platformPostId: result.postId,
        url: result.url,
      };
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      const errorStack = getErrorStack(error);

      this.logger.error(
        `Failed to publish Instagram post: ${errorMessage}`,
        errorStack,
      );

      // Re-throw with context
      throw new Error(`Instagram posting failed: ${errorMessage}`);
    }
  }

  /**
   * Validate post content
   * Basic validation before processing
   */
  private validateContent(content: PostContent): void {
    // Instagram requires media
    if (!content.media || content.media.length === 0) {
      throw new Error('Instagram posts require at least one image or video');
    }

    // Caption is optional but if provided, validate length
    if (content.text && content.text.length > 2200) {
      this.logger.warn(
        `Caption exceeds 2200 characters. It will be truncated.`,
      );
    }
  }

  /**
   * Check if the Instagram integration is ready
   * Useful for health checks
   */
  isReady(): boolean {
    return this.apiClient.isConfigured();
  }

  /**
   * Check if a user has valid Instagram authentication
   */
  async hasValidAuth(userId: string): Promise<boolean> {
    return this.oauthService.hasValidConnection(userId);
  }
}
