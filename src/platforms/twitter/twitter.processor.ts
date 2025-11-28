import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { PostContent } from '../../common/interfaces';
import { TwitterService } from './twitter.service';
import { getErrorMessage, getErrorStack } from '../../common/utils/error.utils';

@Processor('twitter-posts')
export class TwitterProcessor {
  private readonly logger = new Logger(TwitterProcessor.name);

  constructor(private readonly twitterService: TwitterService) {}

  @Process('post')
  async handlePost(job: Job<PostContent>) {
    this.logger.log(`Processing Twitter post job ${job.id}`);

    try {
      // Extract twitterUserId from metadata if present (for user-level OAuth 2.0 posting)
      const twitterUserId = job.data.metadata?.twitterUserId as
        | string
        | undefined;

      if (twitterUserId) {
        this.logger.log(`Posting as Twitter user: ${twitterUserId}`);
      }

      const result = await this.twitterService.publishPost(
        job.data,
        twitterUserId,
      );
      this.logger.log(`Twitter post ${job.id} completed successfully`);
      return result;
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      const errorStack = getErrorStack(error);

      this.logger.error(
        `Failed to process Twitter post ${job.id}: ${errorMessage}`,
        errorStack,
      );
      throw error;
    }
  }
}
