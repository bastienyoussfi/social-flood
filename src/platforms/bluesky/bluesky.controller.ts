import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { BlueskyAdapter } from './bluesky.adapter';
import { CreateBlueskyPostDto } from './dto';
import { PostContent, PostResult } from '../../common/interfaces';

/**
 * Bluesky Controller
 * Handles Bluesky-specific posting endpoints
 */
@ApiTags('bluesky')
@Controller('api/platforms/bluesky')
export class BlueskyController {
  constructor(private readonly blueskyAdapter: BlueskyAdapter) {}

  /**
   * Create a new Bluesky post (skeet)
   */
  @Post('posts')
  @ApiOperation({ summary: 'Create a post on Bluesky' })
  @ApiResponse({
    status: 201,
    description: 'Post successfully queued for posting',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request - validation failed',
  })
  async createPost(@Body() dto: CreateBlueskyPostDto): Promise<PostResult> {
    const content = this.mapToPostContent(dto);
    return this.blueskyAdapter.post(content);
  }

  /**
   * Maps the Bluesky-specific DTO to the generic PostContent interface
   */
  private mapToPostContent(dto: CreateBlueskyPostDto): PostContent {
    return {
      text: dto.text,
      media: dto.media?.map((m) => ({
        url: m.url,
        type: 'image' as const,
        alt: m.alt,
      })),
      link: dto.link,
    };
  }
}
