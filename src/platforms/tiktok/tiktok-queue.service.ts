import { OnQueueCompleted, OnQueueFailed, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Job } from 'bull';
import {
  PlatformPost,
  Post,
  PostEntityStatus,
  PlatformPostStatus,
} from '../../database/entities';

interface TikTokJobData {
  metadata?: {
    postId?: string;
  };
  [key: string]: unknown;
}

interface TikTokJobResult {
  platformPostId: string;
  url: string;
}

/**
 * TikTok Queue Event Handler
 * Listens to queue events and updates database accordingly
 */
@Processor('tiktok-posts')
export class TikTokQueueService {
  private readonly logger = new Logger(TikTokQueueService.name);

  constructor(
    @InjectRepository(PlatformPost)
    private readonly platformPostRepository: Repository<PlatformPost>,
    @InjectRepository(Post)
    private readonly postRepository: Repository<Post>,
  ) {}

  /**
   * Handle successful job completion
   * Updates the platform_posts table with the result
   */
  @OnQueueCompleted()
  async onCompleted(
    job: Job<TikTokJobData>,
    result: TikTokJobResult,
  ): Promise<void> {
    try {
      this.logger.log(`Job ${job.id} completed. Updating database...`);

      // Find the platform post by postId from job metadata
      const postId = job.data.metadata?.postId;
      if (!postId) {
        this.logger.warn(
          `Job ${job.id} completed but no postId found in metadata`,
        );
        return;
      }

      const platformPost = await this.platformPostRepository.findOne({
        where: {
          postId: postId,
          platform: 'tiktok',
        },
      });

      if (!platformPost) {
        this.logger.error(
          `Platform post not found for postId: ${postId} and platform: tiktok`,
        );
        return;
      }

      // Update with the result from the job
      platformPost.status = PlatformPostStatus.POSTED;
      platformPost.platformPostId = result?.platformPostId;
      platformPost.url = result?.url;
      platformPost.postedAt = new Date();

      await this.platformPostRepository.save(platformPost);

      // Check if all platform posts for this post are completed
      await this.updatePostStatus(postId);

      this.logger.log(
        `Updated platform post for TikTok. Post ID: ${postId}, TikTok ID: ${result?.platformPostId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to update database after job completion: ${(error as Error).message}`,
        (error as Error).stack,
      );
    }
  }

  /**
   * Handle failed job
   * Updates the platform_posts table with the error
   */
  @OnQueueFailed()
  async onFailed(job: Job<TikTokJobData>, error: Error): Promise<void> {
    try {
      this.logger.error(`Job ${job.id} failed: ${error.message}`, error.stack);

      const postId = job.data.metadata?.postId;
      if (!postId) {
        this.logger.warn(
          `Job ${job.id} failed but no postId found in metadata`,
        );
        return;
      }

      const platformPost = await this.platformPostRepository.findOne({
        where: {
          postId: postId,
          platform: 'tiktok',
        },
      });

      if (!platformPost) {
        this.logger.error(
          `Platform post not found for postId: ${postId} and platform: tiktok`,
        );
        return;
      }

      // Update with error information
      platformPost.status = PlatformPostStatus.FAILED;
      platformPost.errorMessage = error.message;

      await this.platformPostRepository.save(platformPost);

      // Update the main post status
      await this.updatePostStatus(postId);

      this.logger.log(
        `Updated platform post with error for post ID: ${postId}`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to update database after job failure: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  /**
   * Update the main post status based on platform posts
   */
  private async updatePostStatus(postId: string): Promise<void> {
    const post = await this.postRepository.findOne({
      where: { id: postId },
      relations: ['platformPosts'],
    });

    if (!post) {
      this.logger.error(`Post not found: ${postId}`);
      return;
    }

    // Check if all platform posts are completed (either posted or failed)
    const allCompleted = post.platformPosts.every(
      (pp) =>
        pp.status === PlatformPostStatus.POSTED ||
        pp.status === PlatformPostStatus.FAILED,
    );

    if (!allCompleted) {
      return; // Still processing
    }

    // Check if any succeeded
    const anySucceeded = post.platformPosts.some(
      (pp) => pp.status === PlatformPostStatus.POSTED,
    );

    if (anySucceeded) {
      post.status = PostEntityStatus.COMPLETED;
    } else {
      post.status = PostEntityStatus.FAILED;
    }

    await this.postRepository.save(post);
    this.logger.log(
      `Updated main post status to ${post.status} for post ID: ${postId}`,
    );
  }
}
