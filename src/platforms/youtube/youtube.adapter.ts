import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import {
  PlatformAdapter,
  PostContent,
  PostResult,
  PostStatus,
  Platform,
  ValidationResult,
} from '../../common/interfaces';
import { parseJobReturnValue } from '../utils/job-result.parser';

@Injectable()
export class YoutubeAdapter implements PlatformAdapter {
  private readonly logger = new Logger(YoutubeAdapter.name);

  // YouTube content limits
  private readonly MAX_TITLE_LENGTH = 100;
  private readonly MAX_DESCRIPTION_LENGTH = 5000;
  private readonly MAX_TAGS = 30;
  private readonly MAX_TAG_LENGTH = 30;
  private readonly MAX_TOTAL_TAGS_LENGTH = 500;

  constructor(
    @InjectQueue('youtube-posts') private readonly youtubeQueue: Queue,
  ) {}

  async post(content: PostContent): Promise<PostResult> {
    this.logger.log('Adding YouTube post to queue');

    const validation = this.validateContent(content);
    if (!validation.valid) {
      return {
        jobId: '',
        status: PostStatus.FAILED,
        platform: Platform.YOUTUBE,
        error: validation.errors?.join(', '),
      };
    }

    const job = await this.youtubeQueue.add('post', content, {
      attempts: 2, // YouTube uploads can be large, limit retries
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      timeout: 60 * 60 * 1000, // 60 minutes timeout for large video uploads and processing
    });

    return {
      jobId: job.id.toString(),
      status: PostStatus.QUEUED,
      platform: Platform.YOUTUBE,
    };
  }

  validateContent(content: PostContent): ValidationResult {
    const errors: string[] = [];

    // YouTube requires exactly one video
    if (!content.media || content.media.length === 0) {
      errors.push('Video is required for YouTube posts');
    } else {
      // Check that media is video type
      const firstMedia = content.media[0];
      if (firstMedia.type !== 'video') {
        errors.push(
          `YouTube only supports video uploads. Got type: ${firstMedia.type}`,
        );
      }

      // Check that video URL is present
      if (!firstMedia.url) {
        errors.push('Video URL is required');
      }

      // YouTube only supports one video per post
      if (content.media.length > 1) {
        errors.push('YouTube only supports one video per upload');
      }
    }

    // Validate text content (required for title/description)
    if (!content.text || content.text.trim().length === 0) {
      errors.push(
        'Text content is required for YouTube posts (used as video title and description)',
      );
    } else {
      // Extract title from text (first line)
      const titleCandidate = content.text.split('\n')[0] || content.text;
      const title = titleCandidate.substring(0, this.MAX_TITLE_LENGTH).trim();

      if (title.length === 0) {
        errors.push('Cannot extract video title from content');
      }

      if (titleCandidate.length > this.MAX_TITLE_LENGTH) {
        this.logger.warn(
          `Title will be truncated from ${titleCandidate.length} to ${this.MAX_TITLE_LENGTH} characters`,
        );
      }

      // Check description length
      if (content.text.length > this.MAX_DESCRIPTION_LENGTH) {
        this.logger.warn(
          `Description will be truncated from ${content.text.length} to ${this.MAX_DESCRIPTION_LENGTH} characters`,
        );
      }
    }

    // Validate tags if provided in metadata
    if (content.metadata?.tags) {
      const tagsValidation = this.validateTags(content.metadata.tags as string[]);
      if (!tagsValidation.valid && tagsValidation.errors) {
        errors.push(...tagsValidation.errors);
      }
    }

    // Validate privacy status if provided
    if (content.metadata?.privacyStatus) {
      const validPrivacyStatuses = ['public', 'unlisted', 'private'];
      if (!validPrivacyStatuses.includes(content.metadata.privacyStatus as string)) {
        errors.push(
          `Invalid privacy status. Must be one of: ${validPrivacyStatuses.join(', ')}`,
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Validate YouTube tags
   */
  private validateTags(tags: string[]): ValidationResult {
    const errors: string[] = [];

    if (!Array.isArray(tags)) {
      errors.push('Tags must be an array');
      return { valid: false, errors };
    }

    if (tags.length > this.MAX_TAGS) {
      errors.push(
        `Too many tags. Maximum ${this.MAX_TAGS} tags allowed. Got: ${tags.length}`,
      );
    }

    // Check individual tag lengths
    const longTags = tags.filter(tag => tag.length > this.MAX_TAG_LENGTH);
    if (longTags.length > 0) {
      this.logger.warn(
        `${longTags.length} tag(s) exceed ${this.MAX_TAG_LENGTH} characters and will be filtered`,
      );
    }

    // Check total tags length
    const totalLength = tags.join('').length;
    if (totalLength > this.MAX_TOTAL_TAGS_LENGTH) {
      this.logger.warn(
        `Total tags length (${totalLength}) exceeds ${this.MAX_TOTAL_TAGS_LENGTH} characters. Tags will be truncated.`,
      );
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  async getPostStatus(jobId: string): Promise<PostResult> {
    const job = await this.youtubeQueue.getJob(jobId);

    if (!job) {
      return {
        jobId,
        status: PostStatus.FAILED,
        platform: Platform.YOUTUBE,
        error: 'Job not found',
      };
    }

    const state = await job.getState();
    let status: PostStatus;

    switch (state) {
      case 'completed':
        status = PostStatus.POSTED;
        break;
      case 'failed':
        status = PostStatus.FAILED;
        break;
      default:
        status = PostStatus.QUEUED;
    }

    const returnValue = parseJobReturnValue(job.returnvalue);

    return {
      jobId,
      status,
      platform: Platform.YOUTUBE,
      platformPostId: returnValue?.platformPostId,
      url: returnValue?.url,
      error: job.failedReason,
    };
  }
}
