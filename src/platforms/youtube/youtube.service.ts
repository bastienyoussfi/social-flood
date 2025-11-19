import { Injectable, Logger } from '@nestjs/common';
import { PostContent } from '../../common/interfaces';
import { YoutubeApiClient } from './youtube-api.client';
import { YoutubeMediaService } from './youtube-media.service';
import { YoutubeVideoMetadata } from './interfaces';
import { getErrorMessage, getErrorStack } from '../../common/utils/error.utils';

/**
 * YouTube Service
 * Orchestrates the process of uploading videos to YouTube
 * Coordinates between API client and media service
 */
@Injectable()
export class YoutubeService {
  private readonly logger = new Logger(YoutubeService.name);

  // YouTube content limits
  private readonly MAX_TITLE_LENGTH = 100;
  private readonly MAX_DESCRIPTION_LENGTH = 5000;
  private readonly MAX_TAGS = 30;
  private readonly MAX_TAG_LENGTH = 30;
  private readonly MAX_TOTAL_TAGS_LENGTH = 500;

  constructor(
    private readonly apiClient: YoutubeApiClient,
    private readonly mediaService: YoutubeMediaService,
  ) {}

  /**
   * Publish a video to YouTube
   * Handles video upload and processing status polling
   * @param content - Post content with text and video
   * @returns Video ID and URL
   */
  async publishPost(content: PostContent): Promise<{
    platformPostId: string;
    url: string;
  }> {
    try {
      this.logger.log('Starting YouTube video publication');

      // Validate configuration
      if (!this.apiClient.isConfigured()) {
        throw new Error(
          'YouTube API is not properly configured. Please check your OAuth credentials.',
        );
      }

      // Validate content
      this.validateContent(content);

      // Step 1: Prepare video metadata
      const metadata = this.prepareMetadata(content);
      this.logger.log(`Video metadata prepared: "${metadata.title}"`);

      // Step 2: Download video
      const videoUrl = content.media![0].url;
      this.logger.log(`Downloading video from: ${videoUrl}`);
      const videoBuffer = await this.mediaService.downloadVideo(videoUrl);

      // Step 3: Validate video
      const validation = this.mediaService.validateVideoBuffer(videoBuffer, false);
      if (!validation.valid) {
        throw new Error(
          `Video validation failed: ${validation.errors?.join(', ')}`,
        );
      }

      const videoSizeMB = (validation.size / 1024 / 1024).toFixed(2);
      this.logger.log(
        `Video validated: ${videoSizeMB} MB, format: ${validation.format || 'unknown'}`,
      );

      // Step 4: Initialize resumable upload
      this.logger.log('Initializing YouTube resumable upload');
      const uploadUrl = await this.apiClient.initializeResumableUpload(metadata);

      // Step 5: Upload video bytes
      this.logger.log('Uploading video to YouTube');
      const uploadResponse = await this.apiClient.uploadVideoBytes(
        uploadUrl,
        videoBuffer,
      );

      const videoId = uploadResponse.id;
      this.logger.log(`Video uploaded successfully. Video ID: ${videoId}`);

      // Step 6: Poll for processing completion
      // YouTube processes videos asynchronously, this can take several minutes
      this.logger.log('Waiting for YouTube to process the video...');
      const processedVideo = await this.apiClient.waitForProcessing(videoId);

      const videoUrl = this.apiClient.getVideoUrl(videoId);

      this.logger.log(
        `YouTube video published successfully. Video ID: ${videoId}, URL: ${videoUrl}`,
      );

      return {
        platformPostId: videoId,
        url: videoUrl,
      };
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      const errorStack = getErrorStack(error);

      this.logger.error(
        `Failed to publish to YouTube: ${errorMessage}`,
        errorStack,
      );

      // Re-throw with context
      throw new Error(`YouTube posting failed: ${errorMessage}`);
    }
  }

  /**
   * Prepare video metadata from post content
   * Extracts title, description, and tags from content
   */
  private prepareMetadata(content: PostContent): YoutubeVideoMetadata {
    // Extract title from text (first line or truncate)
    let title = content.text || 'Untitled Video';
    const firstLineEnd = title.indexOf('\n');
    if (firstLineEnd > 0) {
      title = title.substring(0, firstLineEnd);
    }
    title = title.substring(0, this.MAX_TITLE_LENGTH).trim();

    // Description can be the full text or remaining text after title
    let description = content.text || '';
    if (firstLineEnd > 0) {
      description = content.text!.substring(firstLineEnd + 1).trim();
    }
    description = description.substring(0, this.MAX_DESCRIPTION_LENGTH);

    // Add link to description if provided
    if (content.link) {
      description += description ? `\n\n${content.link}` : content.link;
      description = description.substring(0, this.MAX_DESCRIPTION_LENGTH);
    }

    // Extract tags from metadata if available
    const tags = this.extractTags(content);

    // Privacy status from metadata or default to public
    const privacyStatus = (content.metadata?.privacyStatus as 'public' | 'unlisted' | 'private') || 'public';

    // Made for kids flag
    const madeForKids = (content.metadata?.madeForKids as boolean) || false;

    // Category ID (defaults to "22" = People & Blogs)
    const categoryId = (content.metadata?.categoryId as string) || '22';

    return {
      title,
      description,
      tags,
      privacyStatus,
      madeForKids,
      categoryId,
    };
  }

  /**
   * Extract and validate tags from content metadata
   */
  private extractTags(content: PostContent): string[] {
    if (!content.metadata?.tags) {
      return [];
    }

    let tags: string[] = [];

    if (Array.isArray(content.metadata.tags)) {
      tags = content.metadata.tags as string[];
    }

    // Validate and filter tags
    const validTags = tags
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0 && tag.length <= this.MAX_TAG_LENGTH)
      .slice(0, this.MAX_TAGS);

    // Check total tags length
    const totalLength = validTags.join('').length;
    if (totalLength > this.MAX_TOTAL_TAGS_LENGTH) {
      this.logger.warn(
        `Tags total length (${totalLength}) exceeds limit (${this.MAX_TOTAL_TAGS_LENGTH}). Truncating...`,
      );

      // Reduce tags until within limit
      const reducedTags: string[] = [];
      let currentLength = 0;

      for (const tag of validTags) {
        if (currentLength + tag.length <= this.MAX_TOTAL_TAGS_LENGTH) {
          reducedTags.push(tag);
          currentLength += tag.length;
        } else {
          break;
        }
      }

      return reducedTags;
    }

    return validTags;
  }

  /**
   * Validate post content for YouTube requirements
   */
  private validateContent(content: PostContent): void {
    // YouTube requires exactly one video
    const mediaValidation = this.mediaService.validateMedia(content.media);
    if (!mediaValidation.valid) {
      throw new Error(
        `Media validation failed: ${mediaValidation.errors.join(', ')}`,
      );
    }

    // Validate title can be extracted
    if (!content.text || content.text.trim().length === 0) {
      throw new Error(
        'Text content is required for YouTube posts (used as video title/description)',
      );
    }

    // Check text length for title extraction
    const titleCandidate = content.text.split('\n')[0] || content.text;
    if (titleCandidate.trim().length === 0) {
      throw new Error('Cannot extract video title from content');
    }
  }

  /**
   * Check if the YouTube integration is ready
   * Useful for health checks
   */
  isReady(): boolean {
    return this.apiClient.isConfigured();
  }
}
