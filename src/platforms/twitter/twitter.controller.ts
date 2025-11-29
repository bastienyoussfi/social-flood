import {
  Controller,
  Post,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { TwitterAdapter } from './twitter.adapter';
import { CreateTwitterPostDto } from './dto';
import { PostContent, PostResult } from '../../common/interfaces';
import { AuthGuard, CurrentUser } from '../../better-auth';
import type { User } from '../../lib/auth';
import { ConnectionsService } from '../../connections/connections.service';

/**
 * Twitter Controller
 * Handles Twitter-specific posting endpoints
 */
@ApiTags('twitter')
@Controller('api/platforms/twitter')
export class TwitterController {
  constructor(
    private readonly twitterAdapter: TwitterAdapter,
    private readonly connectionsService: ConnectionsService,
  ) {}

  /**
   * Create a new tweet
   */
  @Post('posts')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Create a tweet on Twitter' })
  @ApiResponse({
    status: 201,
    description: 'Tweet successfully queued for posting',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request - validation failed',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - authentication required',
  })
  async createPost(
    @Body() dto: CreateTwitterPostDto,
    @CurrentUser() user: User,
  ): Promise<PostResult> {
    // Fetch Twitter user ID from the user's connection
    const twitterUserId = await this.getTwitterUserId(user.id);

    const content = this.mapToPostContent(dto, twitterUserId);
    return this.twitterAdapter.post(content);
  }

  /**
   * Get the Twitter user ID from the user's connection
   */
  private async getTwitterUserId(userId: string): Promise<string> {
    const connections = await this.connectionsService.getConnectionsByPlatform(
      userId,
      'twitter',
    );

    if (connections.length === 0) {
      throw new BadRequestException(
        'No active Twitter connection found. Please connect your Twitter account first at /api/connections/twitter/connect',
      );
    }

    const connection = connections[0];

    if (!connection.platformUserId) {
      throw new BadRequestException(
        'Twitter connection exists but platform user ID is missing. Please reconnect your Twitter account.',
      );
    }

    return connection.platformUserId;
  }

  /**
   * Maps the Twitter-specific DTO to the generic PostContent interface
   */
  private mapToPostContent(
    dto: CreateTwitterPostDto,
    twitterUserId: string,
  ): PostContent {
    return {
      text: dto.text,
      media: dto.media?.map((m) => ({
        url: m.url,
        type: 'image' as const,
        alt: m.alt,
      })),
      metadata: {
        twitterUserId,
      },
    };
  }
}
