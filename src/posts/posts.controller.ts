import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { PostsService } from './posts.service';
import { CreatePostDto } from './dto/create-post.dto';

@ApiTags('posts')
@Controller('api/posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Post('multi-platform')
  @ApiOperation({ summary: 'Create a post on multiple platforms' })
  @ApiResponse({
    status: 201,
    description: 'Post successfully queued for all platforms',
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async createMultiPlatformPost(@Body() createPostDto: CreatePostDto) {
    return this.postsService.createMultiPlatformPost(createPostDto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get post status' })
  @ApiResponse({ status: 200, description: 'Returns post status' })
  @ApiResponse({ status: 404, description: 'Post not found' })
  async getPostStatus(@Param('id') id: string) {
    return this.postsService.getPostStatus(id);
  }
}
