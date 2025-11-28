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
import { DEFAULT_INSTAGRAM_CONFIG } from './interfaces';

/**
 * Instagram Platform Adapter
 * Implements PlatformAdapter interface for Instagram posting
 */
@Injectable()
export class InstagramAdapter implements PlatformAdapter {
  private readonly logger = new Logger(InstagramAdapter.name);
  private readonly config = DEFAULT_INSTAGRAM_CONFIG;

  constructor(
    @InjectQueue('instagram-posts') private readonly instagramQueue: Queue,
  ) {}

  /**
   * Add post to Instagram queue
   */
  async post(content: PostContent): Promise<PostResult> {
    this.logger.log('Adding Instagram post to queue');

    const validation = this.validateContent(content);
    if (!validation.valid) {
      return {
        jobId: '',
        status: PostStatus.FAILED,
        platform: Platform.INSTAGRAM,
        error: validation.errors?.join(', '),
      };
    }

    const job = await this.instagramQueue.add('post', content, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
    });

    return {
      jobId: job.id.toString(),
      status: PostStatus.QUEUED,
      platform: Platform.INSTAGRAM,
    };
  }

  /**
   * Validate content against Instagram requirements
   */
  validateContent(content: PostContent): ValidationResult {
    const errors: string[] = [];

    // Instagram requires media
    if (!content.media || content.media.length === 0) {
      errors.push('Instagram posts require at least one image or video');
    }

    // Validate media count (max 10 for carousel)
    if (content.media && content.media.length > 10) {
      errors.push('Instagram supports a maximum of 10 media items per post');
    }

    // Validate caption length
    if (content.text && content.text.length > this.config.maxCaptionLength) {
      errors.push(
        `Caption exceeds Instagram's ${this.config.maxCaptionLength} character limit`,
      );
    }

    // Check hashtag count
    if (content.text) {
      const hashtagCount = (content.text.match(/#\w+/g) || []).length;
      if (hashtagCount > this.config.maxHashtags) {
        errors.push(
          `Too many hashtags. Instagram allows maximum ${this.config.maxHashtags} hashtags`,
        );
      }
    }

    // Validate media types
    if (content.media && content.media.length > 0) {
      for (let i = 0; i < content.media.length; i++) {
        const media = content.media[i];
        if (!['image', 'video'].includes(media.type)) {
          errors.push(
            `Media item ${i + 1}: Invalid type '${media.type}'. Must be 'image' or 'video'`,
          );
        }

        if (!media.url) {
          errors.push(`Media item ${i + 1}: URL is required`);
        }
      }
    }

    // Validate userId in metadata (required for OAuth)
    if (!content.metadata?.userId) {
      errors.push(
        'User ID is required in metadata for Instagram posting (metadata.userId)',
      );
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Get the status of a queued post
   */
  async getPostStatus(jobId: string): Promise<PostResult> {
    const job = await this.instagramQueue.getJob(jobId);

    if (!job) {
      return {
        jobId,
        status: PostStatus.FAILED,
        platform: Platform.INSTAGRAM,
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
      platform: Platform.INSTAGRAM,
      platformPostId: returnValue?.platformPostId,
      url: returnValue?.url,
      error: job.failedReason,
    };
  }
}
