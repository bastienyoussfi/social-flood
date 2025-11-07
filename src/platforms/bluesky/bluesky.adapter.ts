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
export class BlueskyAdapter implements PlatformAdapter {
  private readonly logger = new Logger(BlueskyAdapter.name);
  private readonly CHARACTER_LIMIT = 300;

  constructor(
    @InjectQueue('bluesky-posts') private readonly blueskyQueue: Queue,
  ) {}

  async post(content: PostContent): Promise<PostResult> {
    this.logger.log('Adding Bluesky post to queue');

    const validation = this.validateContent(content);
    if (!validation.valid) {
      return {
        jobId: '',
        status: PostStatus.FAILED,
        platform: Platform.BLUESKY,
        error: validation.errors?.join(', '),
      };
    }

    const job = await this.blueskyQueue.add('post', content, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
    });

    return {
      jobId: job.id.toString(),
      status: PostStatus.QUEUED,
      platform: Platform.BLUESKY,
    };
  }

  validateContent(content: PostContent): ValidationResult {
    const errors: string[] = [];

    if (!content.text || content.text.trim().length === 0) {
      errors.push('Text content is required');
    }

    if (content.text && content.text.length > this.CHARACTER_LIMIT) {
      errors.push(
        `Text exceeds Bluesky's ${this.CHARACTER_LIMIT} character limit`,
      );
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  async getPostStatus(jobId: string): Promise<PostResult> {
    const job = await this.blueskyQueue.getJob(jobId);

    if (!job) {
      return {
        jobId,
        status: PostStatus.FAILED,
        platform: Platform.BLUESKY,
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
      platform: Platform.BLUESKY,
      platformPostId: returnValue?.platformPostId,
      url: returnValue?.url,
      error: job.failedReason,
    };
  }
}
