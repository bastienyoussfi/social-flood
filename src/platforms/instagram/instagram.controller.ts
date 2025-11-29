import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { InstagramAdapter } from './instagram.adapter';
import { CreateInstagramPostDto } from './dto';
import { PostContent, PostResult } from '../../common/interfaces';

/**
 * Instagram Controller
 * Handles Instagram-specific posting endpoints
 */
@ApiTags('instagram')
@Controller('api/platforms/instagram')
export class InstagramController {
  constructor(private readonly instagramAdapter: InstagramAdapter) {}

  /**
   * Create a new Instagram post
   */
  @Post('posts')
  @ApiOperation({ summary: 'Create a post on Instagram' })
  @ApiResponse({
    status: 201,
    description: 'Post successfully queued for posting',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request - validation failed',
  })
  async createPost(@Body() dto: CreateInstagramPostDto): Promise<PostResult> {
    const content = this.mapToPostContent(dto);
    return this.instagramAdapter.post(content);
  }

  /**
   * Maps the Instagram-specific DTO to the generic PostContent interface
   */
  private mapToPostContent(dto: CreateInstagramPostDto): PostContent {
    return {
      text: dto.caption || '',
      media: dto.media.map((m) => ({
        url: m.url,
        type: m.type,
        alt: m.alt,
      })),
      metadata: {
        userId: dto.userId,
        ...(dto.locationId && { locationId: dto.locationId }),
        ...(dto.coverUrl && { coverUrl: dto.coverUrl }),
        ...(dto.shareToFacebook !== undefined && {
          shareToFacebook: dto.shareToFacebook,
        }),
      },
    };
  }
}
