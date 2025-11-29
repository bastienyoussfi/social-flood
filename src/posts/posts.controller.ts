import { Controller, Post, Body, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { PostsService } from './posts.service';
import { CreatePostDto } from './dto/create-post.dto';
import { AuthGuard, CurrentUser } from '../better-auth';
import type { User } from '../lib/auth';

@ApiTags('posts')
@Controller('api/posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Post('multi-platform')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Create a post on multiple platforms' })
  @ApiResponse({
    status: 201,
    description: 'Post successfully queued for all platforms',
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - authentication required',
  })
  async createMultiPlatformPost(
    @Body() createPostDto: CreatePostDto,
    @CurrentUser() user: User,
  ) {
    return this.postsService.createMultiPlatformPost(createPostDto, user.id);
  }

  @Get(':id')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Get post status' })
  @ApiResponse({ status: 200, description: 'Returns post status' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - authentication required',
  })
  @ApiResponse({ status: 404, description: 'Post not found' })
  async getPostStatus(@Param('id') id: string) {
    return this.postsService.getPostStatus(id);
  }
}
