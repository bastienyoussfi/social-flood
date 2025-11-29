import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Post, PostEntityStatus, PlatformPost } from '../database/entities';
import { CreatePostDto } from './dto/create-post.dto';
import { LinkedInAdapter } from '../platforms/linkedin/linkedin.adapter';
import { TwitterAdapter } from '../platforms/twitter/twitter.adapter';
import { BlueskyAdapter } from '../platforms/bluesky/bluesky.adapter';
import { TikTokAdapter } from '../platforms/tiktok/tiktok.adapter';
import { PinterestAdapter } from '../platforms/pinterest/pinterest.adapter';
import { InstagramAdapter } from '../platforms/instagram/instagram.adapter';
import {
  PostContent,
  Platform,
  PlatformAdapter,
  PostResult,
  PostStatus,
} from '../common/interfaces';
import { mapPostStatusToEntityStatus } from './utils/status-mapper';
import { ConnectionsService } from '../connections/connections.service';

@Injectable()
export class PostsService {
  private readonly logger = new Logger(PostsService.name);
  private readonly platformAdapters: Map<Platform, PlatformAdapter>;

  constructor(
    @InjectRepository(Post)
    private readonly postRepository: Repository<Post>,
    @InjectRepository(PlatformPost)
    private readonly platformPostRepository: Repository<PlatformPost>,
    private readonly linkedInAdapter: LinkedInAdapter,
    private readonly twitterAdapter: TwitterAdapter,
    private readonly blueskyAdapter: BlueskyAdapter,
    private readonly tiktokAdapter: TikTokAdapter,
    private readonly pinterestAdapter: PinterestAdapter,
    private readonly instagramAdapter: InstagramAdapter,
    private readonly connectionsService: ConnectionsService,
  ) {
    // Initialize adapter registry
    this.platformAdapters = new Map<Platform, PlatformAdapter>([
      [Platform.LINKEDIN, this.linkedInAdapter],
      [Platform.TWITTER, this.twitterAdapter],
      [Platform.BLUESKY, this.blueskyAdapter],
      [Platform.TIKTOK, this.tiktokAdapter],
      [Platform.PINTEREST, this.pinterestAdapter],
      [Platform.INSTAGRAM, this.instagramAdapter],
    ]);
  }

  async createMultiPlatformPost(createPostDto: CreatePostDto, userId: string) {
    this.logger.log(`Creating multi-platform post for user ${userId}`);

    // Fetch platform user IDs from social_connections
    const platformUserIds = await this.fetchPlatformUserIds(
      userId,
      createPostDto.platforms,
    );

    // Create post entity
    const post = this.postRepository.create({
      content: createPostDto.text,
      status: PostEntityStatus.PROCESSING,
    });

    await this.postRepository.save(post);

    // Prepare content with platform-specific metadata
    const content: PostContent = {
      text: createPostDto.text,
      media: createPostDto.media,
      link: createPostDto.link,
      metadata: {
        postId: post.id,
        ...platformUserIds,
      },
    };

    // Post to each platform
    const results = await this.postToAllPlatforms(
      createPostDto.platforms,
      content,
      post.id,
    );

    // Update post status based on results
    post.status = this.determineOverallStatus(results);
    await this.postRepository.save(post);

    this.logger.log(`Multi-platform post created with ID: ${post.id}`);

    return {
      postId: post.id,
      results: this.formatResultsForResponse(results),
    };
  }

  /**
   * Fetch platform user IDs from social_connections table
   */
  private async fetchPlatformUserIds(
    userId: string,
    platforms: Platform[],
  ): Promise<Record<string, string>> {
    const platformUserIds: Record<string, string> = {};

    for (const platform of platforms) {
      // Skip Bluesky as it doesn't use OAuth connections
      if (platform === Platform.BLUESKY) {
        continue;
      }

      // Map Platform enum to connection service platform string
      const platformKey = platform.toLowerCase();

      // Fetch the user's connection for this platform
      const connections =
        await this.connectionsService.getConnectionsByPlatform(
          userId,
          platformKey as any,
        );

      if (connections.length === 0) {
        throw new BadRequestException(
          `No active ${platform} connection found. Please connect your ${platform} account first.`,
        );
      }

      // Use the first active connection (or could let user select which one)
      const connection = connections[0];

      // Ensure platform user ID exists
      if (!connection.platformUserId) {
        throw new BadRequestException(
          `${platform} connection exists but platform user ID is missing. Please reconnect your ${platform} account.`,
        );
      }

      // Map to the metadata key expected by each platform's processor
      switch (platform) {
        case Platform.TWITTER:
          platformUserIds.twitterUserId = connection.platformUserId;
          break;
        case Platform.TIKTOK:
          platformUserIds.tiktokUserId = connection.platformUserId;
          break;
        case Platform.INSTAGRAM:
          platformUserIds.userId = connection.platformUserId;
          break;
        case Platform.LINKEDIN:
          platformUserIds.linkedinUserId = connection.platformUserId;
          break;
        case Platform.PINTEREST:
          platformUserIds.pinterestUserId = connection.platformUserId;
          break;
      }

      this.logger.log(
        `Using ${platform} connection: ${connection.platformUsername} (${connection.platformUserId})`,
      );
    }

    return platformUserIds;
  }

  private async postToAllPlatforms(
    platforms: Platform[],
    content: PostContent,
    postId: string,
  ): Promise<Map<Platform, PostResult>> {
    const results = new Map<Platform, PostResult>();
    const platformPosts: PlatformPost[] = [];

    for (const platform of platforms) {
      const adapter = this.platformAdapters.get(platform);

      if (!adapter) {
        this.logger.warn(`Unknown platform: ${platform}`);
        continue;
      }

      const result = await adapter.post(content);
      results.set(platform, result);

      // Create platform post entity
      const platformPost = this.platformPostRepository.create({
        postId,
        platform,
        status: mapPostStatusToEntityStatus(result.status),
        errorMessage: result.error ?? null,
      });

      platformPosts.push(platformPost);
    }

    // Save all platform posts
    await this.platformPostRepository.save(platformPosts);

    return results;
  }

  private determineOverallStatus(
    results: Map<Platform, PostResult>,
  ): PostEntityStatus {
    const allSuccessful = Array.from(results.values()).every(
      (result) => result.status === PostStatus.QUEUED,
    );

    return allSuccessful
      ? PostEntityStatus.PROCESSING
      : PostEntityStatus.FAILED;
  }

  private formatResultsForResponse(
    results: Map<Platform, PostResult>,
  ): Record<string, PostResult> {
    const formatted: Record<string, PostResult> = {};

    results.forEach((result, platform) => {
      formatted[platform] = result;
    });

    return formatted;
  }

  async getPostStatus(postId: string) {
    const post = await this.postRepository.findOne({
      where: { id: postId },
      relations: ['platformPosts'],
    });

    if (!post) {
      throw new Error('Post not found');
    }

    return {
      postId: post.id,
      status: post.status,
      createdAt: post.createdAt,
      platforms: post.platformPosts.map((pp) => ({
        platform: pp.platform,
        status: pp.status,
        postedAt: pp.postedAt,
        url: pp.url,
        error: pp.errorMessage,
      })),
    };
  }
}
