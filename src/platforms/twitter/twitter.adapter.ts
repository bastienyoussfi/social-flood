import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import {
  PlatformAdapter,
  PostContent,
  PostResult,
  PostStatus,
  Platform,
} from '../../common/interfaces';

@Injectable()
export class TwitterAdapter implements PlatformAdapter {
  private readonly logger = new Logger(TwitterAdapter.name);
  private readonly CHARACTER_LIMIT = 280;
  private readonly MAX_IMAGES = 4;

  constructor(
    @InjectQueue('twitter-posts') private readonly twitterQueue: Queue,
  ) {}

  async post(content: PostContent): Promise<PostResult> {
    this.logger.log('Adding Twitter post to queue');

    const validation = await this.validateContent(content);
    if (!validation.valid) {
      return {
        jobId: '',
        status: PostStatus.FAILED,
        platform: Platform.TWITTER,
        error: validation.errors?.join(', '),
      };
    }

    const job = await this.twitterQueue.add('post', content, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
    });

    return {
      jobId: job.id.toString(),
      status: PostStatus.QUEUED,
      platform: Platform.TWITTER,
    };
  }

  validateContent(
    content: PostContent,
  ): Promise<{ valid: boolean; errors?: string[] }> {
    const errors: string[] = [];

    if (!content.text || content.text.trim().length === 0) {
      errors.push('Text content is required');
    }

    if (content.text && content.text.length > this.CHARACTER_LIMIT) {
      errors.push(
        `Text exceeds Twitter's ${this.CHARACTER_LIMIT} character limit`,
      );
    }

    if (content.media && content.media.length > this.MAX_IMAGES) {
      errors.push(
        `Twitter supports maximum ${this.MAX_IMAGES} images per post`,
      );
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  async getPostStatus(jobId: string): Promise<PostResult> {
    const job = await this.twitterQueue.getJob(jobId);

    if (!job) {
      return {
        jobId,
        status: PostStatus.FAILED,
        platform: Platform.TWITTER,
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

    return {
      jobId,
      status,
      platform: Platform.TWITTER,
      platformPostId: job.returnvalue?.platformPostId,
      url: job.returnvalue?.url,
      error: job.failedReason,
    };
  }
}
