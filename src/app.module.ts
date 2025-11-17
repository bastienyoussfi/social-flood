import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PostsModule } from './posts/posts.module';
import { LinkedInModule } from './platforms/linkedin/linkedin.module';
import { TwitterModule } from './platforms/twitter/twitter.module';
import { BlueskyModule } from './platforms/bluesky/bluesky.module';
import { TikTokModule } from './platforms/tiktok/tiktok.module';
import { getDatabaseConfig } from './config/database.config';
import { getRedisConfig } from './config/redis.config';

@Module({
  imports: [
    // Global configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Database
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        getDatabaseConfig(configService),
    }),

    // Bull Queue
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        getRedisConfig(configService),
    }),

    // Register queues for monitoring
    BullModule.registerQueue(
      { name: 'linkedin-posts' },
      { name: 'twitter-posts' },
      { name: 'bluesky-posts' },
      { name: 'tiktok-posts' },
    ),

    // Platform modules
    LinkedInModule,
    TwitterModule,
    BlueskyModule,
    TikTokModule,

    // Business logic modules
    PostsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
