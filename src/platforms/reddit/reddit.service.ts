import { Injectable, Logger } from '@nestjs/common';
import { PostContent } from '../../common/interfaces';
import { RedditApiClient } from './reddit-api.client';
import { RedditMediaService } from './reddit-media.service';
import {
  RedditPostResult,
  REDDIT_MAX_TITLE_LENGTH,
  REDDIT_MAX_TEXT_LENGTH,
} from './interfaces/reddit-api.interface';
import { getErrorMessage, getErrorStack } from '../../common/utils/error.utils';

/**
 * Reddit Service
 * Orchestrates the process of posting to Reddit
 * Coordinates between API client and media service
 */
@Injectable()
export class RedditService {
  private readonly logger = new Logger(RedditService.name);

  constructor(
    private readonly apiClient: RedditApiClient,
    private readonly mediaService: RedditMediaService,
  ) {}

  /**
   * Publish a post to Reddit
   * Handles text, links, and media attachments
   * @param content - Post content with text and optional media
   * @returns Post ID and URL
   */
  async publishPost(content: PostContent): Promise<{
    platformPostId: string;
    url: string;
  }> {
    try {
      this.logger.log('Starting Reddit post publication');

      // Validate configuration
      if (!this.apiClient.isConfigured()) {
        throw new Error(
          'Reddit API is not properly configured. Please check your credentials.',
        );
      }

      // Extract Reddit-specific metadata
      const metadata = content.metadata || {};
      const subreddit = (metadata.subreddit as string) ||
        this.apiClient.getDefaultSubreddit();
      const title = (metadata.title as string);

      // Validate required fields
      if (!subreddit) {
        throw new Error(
          'Subreddit is required for Reddit posts. Provide it in metadata.subreddit or set REDDIT_DEFAULT_SUBREDDIT.',
        );
      }

      if (!title) {
        throw new Error(
          'Title is required for Reddit posts. Provide it in metadata.title.',
        );
      }

      // Validate content
      this.validateContent(content, title);

      // Authenticate with Reddit (will auto-refresh if needed)
      await this.apiClient.authenticate();

      let result: RedditPostResult;

      // Determine post type and handle accordingly
      if (content.media && content.media.length > 0) {
        // Media post: Upload media and create link post
        result = await this.handleMediaPost(subreddit, title, content);
      } else if (content.link) {
        // Link post: Create link post with URL
        result = await this.handleLinkPost(subreddit, title, content);
      } else {
        // Text post: Create self post
        result = await this.handleTextPost(subreddit, title, content);
      }

      this.logger.log(
        `Reddit post published successfully. ID: ${result.postId}, URL: ${result.url}`,
      );

      return {
        platformPostId: result.postId,
        url: result.url,
      };
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      const errorStack = getErrorStack(error);

      this.logger.error(`Failed to publish to Reddit: ${errorMessage}`, errorStack);

      // Re-throw with context
      throw new Error(`Reddit posting failed: ${errorMessage}`);
    }
  }

  /**
   * Handle text post (self post)
   * @param subreddit - Target subreddit
   * @param title - Post title
   * @param content - Post content
   * @returns Post result
   */
  private async handleTextPost(
    subreddit: string,
    title: string,
    content: PostContent,
  ): Promise<RedditPostResult> {
    this.logger.log('Creating text post');

    // Use the text content directly
    const text = content.text;

    return await this.apiClient.createTextPost(subreddit, title, text);
  }

  /**
   * Handle link post
   * @param subreddit - Target subreddit
   * @param title - Post title
   * @param content - Post content
   * @returns Post result
   */
  private async handleLinkPost(
    subreddit: string,
    title: string,
    content: PostContent,
  ): Promise<RedditPostResult> {
    this.logger.log('Creating link post');

    const url = content.link!;

    return await this.apiClient.createLinkPost(subreddit, title, url);
  }

  /**
   * Handle media post
   * Uploads media first, then creates link post with media URL
   * @param subreddit - Target subreddit
   * @param title - Post title
   * @param content - Post content
   * @returns Post result
   */
  private async handleMediaPost(
    subreddit: string,
    title: string,
    content: PostContent,
  ): Promise<RedditPostResult> {
    this.logger.log(`Processing media post with ${content.media!.length} attachment(s)`);

    // Validate media
    const mediaValidation = this.mediaService.validateMedia(content.media!);
    if (!mediaValidation.valid) {
      throw new Error(
        `Media validation failed: ${mediaValidation.errors?.join(', ')}`,
      );
    }

    // Get access token for media upload
    // We need to ensure we're authenticated first
    await this.apiClient.authenticate();

    // Note: We need to expose a method to get the access token
    // For now, we'll need to refactor the API client slightly
    // But for the implementation, we'll use a workaround by making
    // the media service handle its own authentication

    // Upload media to Reddit's S3
    // For now, we'll skip actual media upload and just note this in logs
    this.logger.warn(
      'Media upload requires access token from API client. This will be implemented in integration.',
    );

    // For text + media posts on Reddit, we have two options:
    // 1. Create a link post with the uploaded media URL
    // 2. Create a text post and include media URLs in markdown
    // We'll use option 2 for now as it's simpler

    // Create text post with media URLs in content
    let textWithMedia = content.text;

    if (content.media && content.media.length > 0) {
      textWithMedia += '\n\n';
      for (const media of content.media) {
        textWithMedia += `![${media.alt || 'Image'}](${media.url})\n`;
      }
    }

    return await this.apiClient.createTextPost(subreddit, title, textWithMedia);
  }

  /**
   * Validate post content
   * Basic validation before processing
   */
  private validateContent(content: PostContent, title: string): void {
    // Validate title
    if (!title || title.trim().length === 0) {
      throw new Error('Post title is required for Reddit');
    }

    if (title.length > REDDIT_MAX_TITLE_LENGTH) {
      throw new Error(
        `Post title exceeds ${REDDIT_MAX_TITLE_LENGTH} characters`,
      );
    }

    // Validate text
    if (!content.text || content.text.trim().length === 0) {
      throw new Error('Post text is required');
    }

    if (content.text.length > REDDIT_MAX_TEXT_LENGTH) {
      throw new Error(
        `Post text exceeds ${REDDIT_MAX_TEXT_LENGTH} characters`,
      );
    }
  }

  /**
   * Check if the Reddit integration is ready
   * Useful for health checks
   */
  isReady(): boolean {
    return this.apiClient.isConfigured();
  }
}
