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
export class TikTokAdapter implements PlatformAdapter {
  private readonly logger = new Logger(TikTokAdapter.name);
  private readonly MAX_CAPTION_LENGTH = 2200;
  private readonly MIN_VIDEO_DURATION = 3; // seconds
  private readonly MAX_VIDEO_DURATION = 600; // 10 minutes

  constructor(
    @InjectQueue('tiktok-posts') private readonly tiktokQueue: Queue,
  ) {}

  async post(content: PostContent): Promise<PostResult> {
    this.logger.log('Adding TikTok post to queue');

    const validation = this.validateContent(content);
    if (!validation.valid) {
      return {
        jobId: '',
        status: PostStatus.FAILED,
        platform: Platform.TIKTOK,
        error: validation.errors?.join(', '),
      };
    }

    const job = await this.tiktokQueue.add('post', content, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      timeout: 10 * 60 * 1000, // 10 minutes timeout for video processing
    });

    return {
      jobId: job.id.toString(),
      status: PostStatus.QUEUED,
      platform: Platform.TIKTOK,
    };
  }

  validateContent(content: PostContent): ValidationResult {
    const errors: string[] = [];

    // TikTok requires video
    if (!content.media || content.media.length === 0) {
      errors.push('Video is required for TikTok posts');
    } else {
      // Check that media is video type
      const firstMedia = content.media[0];
      if (firstMedia.type !== 'video') {
        errors.push(
          `TikTok only supports video posts. Got type: ${firstMedia.type}`,
        );
      }

      // Check that video URL is present
      if (!firstMedia.url) {
        errors.push('Video URL is required');
      }

      // TikTok only supports one video per post
      if (content.media.length > 1) {
        this.logger.warn(
          'TikTok only supports one video per post. Only the first video will be used.',
        );
      }
    }

    // Validate caption length
    if (content.text && content.text.length > this.MAX_CAPTION_LENGTH) {
      errors.push(
        `Caption exceeds TikTok's ${this.MAX_CAPTION_LENGTH} character limit. Got: ${content.text.length}`,
      );
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  async getPostStatus(jobId: string): Promise<PostResult> {
    const job = await this.tiktokQueue.getJob(jobId);

    if (!job) {
      return {
        jobId,
        status: PostStatus.FAILED,
        platform: Platform.TIKTOK,
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
      platform: Platform.TIKTOK,
      platformPostId: returnValue?.platformPostId,
      url: returnValue?.url,
      error: job.failedReason,
    };
  }
}
