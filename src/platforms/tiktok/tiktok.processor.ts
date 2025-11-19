import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { PostContent } from '../../common/interfaces';
import { TikTokService } from './tiktok.service';
import { getErrorMessage, getErrorStack } from '../../common/utils/error.utils';

@Processor('tiktok-posts')
export class TikTokProcessor {
  private readonly logger = new Logger(TikTokProcessor.name);

  constructor(private readonly tiktokService: TikTokService) {}

  @Process('post')
  async handlePost(job: Job<PostContent>) {
    this.logger.log(`Processing TikTok post job ${job.id}`);

    try {
      const result = await this.tiktokService.publishPost(job.data);
      this.logger.log(`TikTok post ${job.id} completed successfully`);
      return result;
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      const errorStack = getErrorStack(error);

      this.logger.error(
        `Failed to process TikTok post ${job.id}: ${errorMessage}`,
        errorStack,
      );
      throw error;
    }
  }
}
