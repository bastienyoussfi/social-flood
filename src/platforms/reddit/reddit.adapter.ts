import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import {
  PlatformAdapter,
  PostContent,
  PostResult,
  ValidationResult,
  PostStatus,
  Platform,
} from '../../common/interfaces';
import {
  REDDIT_MAX_TITLE_LENGTH,
  REDDIT_MAX_TEXT_LENGTH,
} from './interfaces/reddit-api.interface';

/**
 * Reddit Adapter
 * Implements PlatformAdapter interface for Reddit
 * Handles validation and queuing of Reddit posts
 */
@Injectable()
export class RedditAdapter implements PlatformAdapter {
  private readonly logger = new Logger(RedditAdapter.name);

  constructor(
    @InjectQueue('reddit-posts') private readonly redditQueue: Queue,
  ) {}

  /**
   * Post content to Reddit
   * Validates content and adds to processing queue
   * @param content - Post content
   * @returns Post result with job ID and status
   */
  async post(content: PostContent): Promise<PostResult> {
    try {
      this.logger.log('Queuing Reddit post');

      // Validate content
      const validation = this.validateContent(content);
      if (!validation.valid) {
        this.logger.warn(
          `Reddit content validation failed: ${validation.errors?.join(', ')}`,
        );
        return {
          jobId: '',
          status: PostStatus.FAILED,
          platform: Platform.REDDIT,
          error: validation.errors?.join(', '),
        };
      }

      // Add to queue with retry configuration
      const job = await this.redditQueue.add('post', content, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      });

      this.logger.log(`Reddit post queued successfully. Job ID: ${job.id}`);

      return {
        jobId: job.id.toString(),
        status: PostStatus.QUEUED,
        platform: Platform.REDDIT,
      };
    } catch (error) {
      this.logger.error('Failed to queue Reddit post', error);

      return {
        jobId: '',
        status: PostStatus.FAILED,
        platform: Platform.REDDIT,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Validate content against Reddit requirements
   * @param content - Post content to validate
   * @returns Validation result
   */
  validateContent(content: PostContent): ValidationResult {
    const errors: string[] = [];

    // Extract metadata
    const metadata = content.metadata || {};
    const title = metadata.title as string;
    const subreddit = metadata.subreddit as string;

    // Validate title (required for Reddit)
    if (!title) {
      errors.push('Title is required for Reddit posts (provide in metadata.title)');
    } else if (title.length > REDDIT_MAX_TITLE_LENGTH) {
      errors.push(
        `Title exceeds maximum length of ${REDDIT_MAX_TITLE_LENGTH} characters`,
      );
    } else if (title.trim().length === 0) {
      errors.push('Title cannot be empty');
    }

    // Validate subreddit
    if (!subreddit) {
      errors.push(
        'Subreddit is required for Reddit posts (provide in metadata.subreddit or set REDDIT_DEFAULT_SUBREDDIT)',
      );
    } else if (subreddit.includes(' ')) {
      errors.push('Subreddit name cannot contain spaces');
    }

    // Validate text content
    if (!content.text) {
      errors.push('Text content is required');
    } else if (content.text.length > REDDIT_MAX_TEXT_LENGTH) {
      errors.push(
        `Text exceeds maximum length of ${REDDIT_MAX_TEXT_LENGTH} characters`,
      );
    } else if (content.text.trim().length === 0) {
      errors.push('Text content cannot be empty');
    }

    // Validate media (if present)
    if (content.media && content.media.length > 1) {
      errors.push('Reddit integration currently supports only one media attachment per post');
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Get the status of a Reddit post by job ID
   * @param jobId - Job identifier
   * @returns Post result with current status
   */
  async getPostStatus(jobId: string): Promise<PostResult> {
    try {
      const job = await this.redditQueue.getJob(jobId);

      if (!job) {
        return {
          jobId,
          status: PostStatus.FAILED,
          platform: Platform.REDDIT,
          error: 'Job not found',
        };
      }

      const state = await job.getState();
      const isCompleted = await job.isCompleted();
      const isFailed = await job.isFailed();

      let status: PostStatus;
      let error: string | undefined;
      let platformPostId: string | undefined;
      let url: string | undefined;

      if (isCompleted) {
        status = PostStatus.POSTED;
        const result = job.returnvalue;
        if (result) {
          platformPostId = result.platformPostId;
          url = result.url;
        }
      } else if (isFailed) {
        status = PostStatus.FAILED;
        error = job.failedReason;
      } else {
        status = PostStatus.QUEUED;
      }

      return {
        jobId,
        status,
        platform: Platform.REDDIT,
        platformPostId,
        url,
        error,
      };
    } catch (error) {
      this.logger.error(`Failed to get job status: ${jobId}`, error);

      return {
        jobId,
        status: PostStatus.FAILED,
        platform: Platform.REDDIT,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
