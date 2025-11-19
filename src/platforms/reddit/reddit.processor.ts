import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { PostContent } from '../../common/interfaces';
import { RedditService } from './reddit.service';

/**
 * Reddit Processor
 * Processes Reddit post jobs from the Bull queue
 */
@Processor('reddit-posts')
export class RedditProcessor {
  private readonly logger = new Logger(RedditProcessor.name);

  constructor(private readonly redditService: RedditService) {}

  /**
   * Process a Reddit post job
   * @param job - Bull job containing post content
   * @returns Post result with platform post ID and URL
   */
  @Process('post')
  async handlePost(job: Job<PostContent>) {
    this.logger.log(`Processing Reddit post job: ${job.id}`);

    try {
      const result = await this.redditService.publishPost(job.data);

      this.logger.log(
        `Reddit post job ${job.id} completed successfully. Post ID: ${result.platformPostId}`,
      );

      return result;
    } catch (error) {
      this.logger.error(
        `Reddit post job ${job.id} failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error.stack : undefined,
      );

      throw error;
    }
  }
}
