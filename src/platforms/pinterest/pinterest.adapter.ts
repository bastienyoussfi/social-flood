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
export class PinterestAdapter implements PlatformAdapter {
  private readonly logger = new Logger(PinterestAdapter.name);
  private readonly TITLE_LIMIT = 100;
  private readonly DESCRIPTION_LIMIT = 500;

  constructor(
    @InjectQueue('pinterest-posts') private readonly pinterestQueue: Queue,
  ) {}

  async post(content: PostContent): Promise<PostResult> {
    this.logger.log('Adding Pinterest pin to queue');

    const validation = this.validateContent(content);
    if (!validation.valid) {
      return {
        jobId: '',
        status: PostStatus.FAILED,
        platform: Platform.PINTEREST,
        error: validation.errors?.join(', '),
      };
    }

    const job = await this.pinterestQueue.add('post', content, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
    });

    return {
      jobId: job.id.toString(),
      status: PostStatus.QUEUED,
      platform: Platform.PINTEREST,
    };
  }

  validateContent(content: PostContent): ValidationResult {
    const errors: string[] = [];

    if (!content.text || content.text.trim().length === 0) {
      errors.push('Text content is required');
    }

    if (content.text && content.text.length > this.DESCRIPTION_LIMIT) {
      errors.push(
        `Text exceeds Pinterest's ${this.DESCRIPTION_LIMIT} character limit for descriptions`,
      );
    }

    // Pinterest requires at least one image
    if (!content.media || content.media.length === 0) {
      errors.push('Pinterest pins require at least one image');
    }

    // Validate media type
    if (content.media && content.media.length > 0) {
      const firstMedia = content.media[0];
      if (firstMedia.type !== 'image') {
        errors.push('Pinterest only supports image media type');
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  async getPostStatus(jobId: string): Promise<PostResult> {
    const job = await this.pinterestQueue.getJob(jobId);

    if (!job) {
      return {
        jobId,
        status: PostStatus.FAILED,
        platform: Platform.PINTEREST,
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
      platform: Platform.PINTEREST,
      platformPostId: returnValue?.platformPostId,
      url: returnValue?.url,
      error: job.failedReason,
    };
  }
}
