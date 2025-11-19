import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { PostContent } from '../../common/interfaces';
import { PinterestService } from './pinterest.service';
import { getErrorMessage, getErrorStack } from '../../common/utils/error.utils';

@Processor('pinterest-posts')
export class PinterestProcessor {
  private readonly logger = new Logger(PinterestProcessor.name);

  constructor(private readonly pinterestService: PinterestService) {}

  @Process('post')
  async handlePost(job: Job<PostContent>) {
    this.logger.log(`Processing Pinterest pin job ${job.id}`);

    try {
      const result = await this.pinterestService.publishPost(job.data);
      this.logger.log(`Pinterest pin ${job.id} completed successfully`);
      return result;
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      const errorStack = getErrorStack(error);

      this.logger.error(
        `Failed to process Pinterest pin ${job.id}: ${errorMessage}`,
        errorStack,
      );
      throw error;
    }
  }
}
