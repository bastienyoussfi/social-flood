import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { PostContent } from '../../common/interfaces';
import { TwitterService } from './twitter.service';

@Processor('twitter-posts')
export class TwitterProcessor {
  private readonly logger = new Logger(TwitterProcessor.name);

  constructor(private readonly twitterService: TwitterService) {}

  @Process('post')
  async handlePost(job: Job<PostContent>) {
    this.logger.log(`Processing Twitter post job ${job.id}`);

    try {
      const result = await this.twitterService.publishPost(job.data);
      this.logger.log(`Twitter post ${job.id} completed successfully`);
      return result;
    } catch (error) {
      this.logger.error(
        `Failed to process Twitter post ${job.id}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
