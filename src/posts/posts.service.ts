import { Injectable, Logger } from '@nestjs/common';
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

  async createMultiPlatformPost(createPostDto: CreatePostDto) {
    this.logger.log('Creating multi-platform post');

    // Create post entity
    const post = this.postRepository.create({
      content: createPostDto.text,
      status: PostEntityStatus.PROCESSING,
    });

    await this.postRepository.save(post);

    // Prepare content
    const content: PostContent = {
      text: createPostDto.text,
      media: createPostDto.media,
      link: createPostDto.link,
      metadata: {
        postId: post.id,
        ...(createPostDto.tiktokUserId && {
          tiktokUserId: createPostDto.tiktokUserId,
        }),
        ...(createPostDto.twitterUserId && {
          twitterUserId: createPostDto.twitterUserId,
        }),
        ...(createPostDto.instagramUserId && {
          userId: createPostDto.instagramUserId,
        }),
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
