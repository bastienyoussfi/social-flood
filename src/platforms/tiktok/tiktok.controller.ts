import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { TikTokAdapter } from './tiktok.adapter';
import { CreateTikTokPostDto } from './dto';
import { PostContent, PostResult } from '../../common/interfaces';

/**
 * TikTok Controller
 * Handles TikTok-specific posting endpoints
 */
@ApiTags('tiktok')
@Controller('api/platforms/tiktok')
export class TikTokController {
  constructor(private readonly tiktokAdapter: TikTokAdapter) {}

  /**
   * Create a new TikTok video post
   */
  @Post('posts')
  @ApiOperation({ summary: 'Create a video post on TikTok' })
  @ApiResponse({
    status: 201,
    description: 'Video successfully queued for posting',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request - validation failed',
  })
  async createPost(@Body() dto: CreateTikTokPostDto): Promise<PostResult> {
    const content = this.mapToPostContent(dto);
    return this.tiktokAdapter.post(content);
  }

  /**
   * Maps the TikTok-specific DTO to the generic PostContent interface
   */
  private mapToPostContent(dto: CreateTikTokPostDto): PostContent {
    return {
      text: dto.caption || '',
      media: [
        {
          url: dto.videoUrl,
          type: 'video',
        },
      ],
      metadata: {
        tiktokUserId: dto.userId,
        ...(dto.title && { title: dto.title }),
        ...(dto.privacyLevel && { privacyLevel: dto.privacyLevel }),
        ...(dto.disableComment !== undefined && {
          disableComment: dto.disableComment,
        }),
        ...(dto.disableDuet !== undefined && { disableDuet: dto.disableDuet }),
        ...(dto.disableStitch !== undefined && {
          disableStitch: dto.disableStitch,
        }),
        ...(dto.videoCoverTimestampMs !== undefined && {
          videoCoverTimestampMs: dto.videoCoverTimestampMs,
        }),
      },
    };
  }
}
