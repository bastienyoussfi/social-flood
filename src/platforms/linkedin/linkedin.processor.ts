import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { PostContent } from '../../common/interfaces';
import { LinkedInService } from './linkedin.service';

@Processor('linkedin-posts')
export class LinkedInProcessor {
  private readonly logger = new Logger(LinkedInProcessor.name);

  constructor(private readonly linkedInService: LinkedInService) {}

  @Process('post')
  async handlePost(job: Job<PostContent>) {
    this.logger.log(`Processing LinkedIn post job ${job.id}`);

    try {
      const result = await this.linkedInService.publishPost(job.data);
      this.logger.log(`LinkedIn post ${job.id} completed successfully`);
      return result;
    } catch (error) {
      this.logger.error(
        `Failed to process LinkedIn post ${job.id}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
