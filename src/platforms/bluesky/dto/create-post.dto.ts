import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsArray,
  IsOptional,
  ValidateNested,
  MaxLength,
  IsUrl,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Media attachment DTO for Bluesky posts
 * Bluesky supports up to 4 images per post
 */
export class BlueskyMediaDto {
  @ApiProperty({
    description: 'URL of the media file',
    example: 'https://example.com/image.jpg',
  })
  @IsUrl()
  url: string;

  @ApiProperty({
    description: 'Alternative text for the media (for accessibility)',
    required: false,
    example: 'A beautiful sunset over the mountains',
  })
  @IsOptional()
  @IsString()
  alt?: string;
}

/**
 * DTO for creating a Bluesky post (skeet)
 *
 * Bluesky AT Protocol Constraints:
 * - Text: max 300 characters (graphemes)
 * - Media: max 4 images per post
 * - Links: automatically detected and converted to facets
 * - Mentions: @handle.bsky.social format
 */
export class CreateBlueskyPostDto {
  @ApiProperty({
    description: 'The text content of the post',
    example: 'Hello Bluesky! Check out my new project 🦋',
    maxLength: 300,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  text: string;

  @ApiProperty({
    description: 'Media attachments (max 4 images)',
    type: [BlueskyMediaDto],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => BlueskyMediaDto)
  media?: BlueskyMediaDto[];

  @ApiProperty({
    description: 'Link to include as a link card preview',
    required: false,
    example: 'https://example.com/article',
  })
  @IsOptional()
  @IsUrl()
  link?: string;
}
