import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { PinterestAdapter } from './pinterest.adapter';
import { CreatePinterestPostDto } from './dto';
import { PostContent, PostResult } from '../../common/interfaces';

/**
 * Pinterest Controller
 * Handles Pinterest-specific posting endpoints
 */
@ApiTags('pinterest')
@Controller('api/platforms/pinterest')
export class PinterestController {
  constructor(private readonly pinterestAdapter: PinterestAdapter) {}

  /**
   * Create a new Pinterest pin
   */
  @Post('posts')
  @ApiOperation({ summary: 'Create a pin on Pinterest' })
  @ApiResponse({
    status: 201,
    description: 'Pin successfully queued for posting',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request - validation failed',
  })
  async createPost(@Body() dto: CreatePinterestPostDto): Promise<PostResult> {
    const content = this.mapToPostContent(dto);
    return this.pinterestAdapter.post(content);
  }

  /**
   * Maps the Pinterest-specific DTO to the generic PostContent interface
   */
  private mapToPostContent(dto: CreatePinterestPostDto): PostContent {
    return {
      text: dto.description,
      media: [
        {
          url: dto.imageUrl,
          type: 'image',
          alt: dto.altText,
        },
      ],
      link: dto.link,
      metadata: {
        title: dto.title,
        boardId: dto.boardId,
      },
    };
  }
}
