import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule } from '@nestjs/config';
import { TwitterAdapter } from './twitter.adapter';
import { TwitterService } from './twitter.service';
import { TwitterProcessor } from './twitter.processor';

@Module({
  imports: [
    ConfigModule,
    BullModule.registerQueue({
      name: 'twitter-posts',
    }),
  ],
  providers: [TwitterAdapter, TwitterService, TwitterProcessor],
  exports: [TwitterAdapter],
})
export class TwitterModule {}
