import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Post, PostEntityStatus, PlatformPost } from '../database/entities';
import { CreatePostDto } from './dto/create-post.dto';
import { LinkedInAdapter } from '../platforms/linkedin/linkedin.adapter';
import { TwitterAdapter } from '../platforms/twitter/twitter.adapter';
import { BlueskyAdapter } from '../platforms/bluesky/bluesky.adapter';
import { PostContent, Platform } from '../common/interfaces';

@Injectable()
export class PostsService {
  private readonly logger = new Logger(PostsService.name);

  constructor(
    @InjectRepository(Post)
    private readonly postRepository: Repository<Post>,
    @InjectRepository(PlatformPost)
    private readonly platformPostRepository: Repository<PlatformPost>,
    private readonly linkedInAdapter: LinkedInAdapter,
    private readonly twitterAdapter: TwitterAdapter,
    private readonly blueskyAdapter: BlueskyAdapter,
  ) {}

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
      metadata: { postId: post.id },
    };

    // Post to each platform
    const results: Record<string, any> = {};
    const platformPosts: PlatformPost[] = [];

    for (const platform of createPostDto.platforms) {
      let result;

      switch (platform) {
        case Platform.LINKEDIN:
          result = await this.linkedInAdapter.post(content);
          break;
        case Platform.TWITTER:
          result = await this.twitterAdapter.post(content);
          break;
        case Platform.BLUESKY:
          result = await this.blueskyAdapter.post(content);
          break;
        default:
          this.logger.warn(`Unknown platform: ${platform}`);
          continue;
      }

      results[platform] = result;

      // Create platform post entity
      const platformPost = this.platformPostRepository.create({
        postId: post.id,
        platform,
        status: result.status,
        errorMessage: result.error,
      });

      platformPosts.push(platformPost);
    }

    // Save all platform posts
    await this.platformPostRepository.save(platformPosts);

    // Update post status
    const allSuccessful = Object.values(results).every(
      (r: any) => r.status === 'queued',
    );
    post.status = allSuccessful
      ? PostEntityStatus.PROCESSING
      : PostEntityStatus.FAILED;
    await this.postRepository.save(post);

    this.logger.log(`Multi-platform post created with ID: ${post.id}`);

    return {
      postId: post.id,
      results,
    };
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
