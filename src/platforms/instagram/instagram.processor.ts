import { Process, Processor } from '@nestjs/bull';
import type { Job } from 'bull';
import { Logger } from '@nestjs/common';
import { PostContent } from '../../common/interfaces';
import { InstagramService } from './instagram.service';
import { getErrorMessage, getErrorStack } from '../../common/utils/error.utils';

/**
 * Instagram Queue Processor
 * Processes jobs from the instagram-posts queue
 */
@Processor('instagram-posts')
export class InstagramProcessor {
  private readonly logger = new Logger(InstagramProcessor.name);

  constructor(private readonly instagramService: InstagramService) {}

  /**
   * Process a post job
   */
  @Process('post')
  async handlePost(
    job: Job<PostContent>,
  ): Promise<{ platformPostId: string; url: string }> {
    this.logger.log(`Processing Instagram post job: ${job.id}`);

    try {
      const result = await this.instagramService.publishPost(job.data);

      this.logger.log(
        `Instagram post job ${job.id} completed successfully. Post ID: ${result.platformPostId}`,
      );

      return result;
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      const errorStack = getErrorStack(error);

      this.logger.error(
        `Instagram post job ${job.id} failed: ${errorMessage}`,
        errorStack,
      );

      // Re-throw to trigger Bull retry mechanism
      throw error;
    }
  }
}
