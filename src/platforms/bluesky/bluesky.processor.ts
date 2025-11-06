import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { PostContent } from '../../common/interfaces';
import { BlueskyService } from './bluesky.service';

@Processor('bluesky-posts')
export class BlueskyProcessor {
  private readonly logger = new Logger(BlueskyProcessor.name);

  constructor(private readonly blueskyService: BlueskyService) {}

  @Process('post')
  async handlePost(job: Job<PostContent>) {
    this.logger.log(`Processing Bluesky post job ${job.id}`);

    try {
      const result = await this.blueskyService.publishPost(job.data);
      this.logger.log(`Bluesky post ${job.id} completed successfully`);
      return result;
    } catch (error) {
      this.logger.error(
        `Failed to process Bluesky post ${job.id}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
