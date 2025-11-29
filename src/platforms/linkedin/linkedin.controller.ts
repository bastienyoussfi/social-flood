import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { LinkedInAdapter } from './linkedin.adapter';
import { CreateLinkedInPostDto } from './dto';
import { PostContent, PostResult } from '../../common/interfaces';

/**
 * LinkedIn Controller
 * Handles LinkedIn-specific posting endpoints
 */
@ApiTags('linkedin')
@Controller('api/platforms/linkedin')
export class LinkedInController {
  constructor(private readonly linkedInAdapter: LinkedInAdapter) {}

  /**
   * Create a new LinkedIn post
   */
  @Post('posts')
  @ApiOperation({ summary: 'Create a post on LinkedIn' })
  @ApiResponse({
    status: 201,
    description: 'Post successfully queued for posting',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request - validation failed',
  })
  async createPost(@Body() dto: CreateLinkedInPostDto): Promise<PostResult> {
    const content = this.mapToPostContent(dto);
    return this.linkedInAdapter.post(content);
  }

  /**
   * Maps the LinkedIn-specific DTO to the generic PostContent interface
   */
  private mapToPostContent(dto: CreateLinkedInPostDto): PostContent {
    return {
      text: dto.text,
      media: dto.media?.map((m) => ({
        url: m.url,
        type: m.type,
        alt: m.alt,
      })),
      link: dto.article?.url,
      metadata: {
        ...(dto.article?.title && { articleTitle: dto.article.title }),
        ...(dto.article?.description && {
          articleDescription: dto.article.description,
        }),
        ...(dto.visibility && { visibility: dto.visibility }),
      },
    };
  }
}
