import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { PostContent } from '../../common/interfaces';
import { YoutubeService } from './youtube.service';
import { getErrorMessage, getErrorStack } from '../../common/utils/error.utils';

@Processor('youtube-posts')
export class YoutubeProcessor {
  private readonly logger = new Logger(YoutubeProcessor.name);

  constructor(private readonly youtubeService: YoutubeService) {}

  @Process('post')
  async handlePost(job: Job<PostContent>) {
    this.logger.log(`Processing YouTube post job ${job.id}`);

    try {
      const result = await this.youtubeService.publishPost(job.data);
      this.logger.log(`YouTube post ${job.id} completed successfully`);
      return result;
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      const errorStack = getErrorStack(error);

      this.logger.error(
        `Failed to process YouTube post ${job.id}: ${errorMessage}`,
        errorStack,
      );
      throw error;
    }
  }
}
