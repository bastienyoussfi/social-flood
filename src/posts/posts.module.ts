import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';
import { Post, PlatformPost } from '../database/entities';
import { LinkedInModule } from '../platforms/linkedin/linkedin.module';
import { TwitterModule } from '../platforms/twitter/twitter.module';
import { BlueskyModule } from '../platforms/bluesky/bluesky.module';
import { TikTokModule } from '../platforms/tiktok/tiktok.module';
import { PinterestModule } from '../platforms/pinterest/pinterest.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Post, PlatformPost]),
    LinkedInModule,
    TwitterModule,
    BlueskyModule,
    TikTokModule,
    PinterestModule,
    TikTokModule,
  ],
  controllers: [PostsController],
  providers: [PostsService],
})
export class PostsModule {}
