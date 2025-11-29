import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsArray,
  IsOptional,
  ValidateNested,
  MaxLength,
  IsUrl,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Media attachment DTO for LinkedIn posts
 */
export class LinkedInMediaDto {
  @ApiProperty({
    description: 'URL of the media file',
    example: 'https://example.com/image.jpg',
  })
  @IsUrl()
  url: string;

  @ApiProperty({
    description: 'Type of media',
    enum: ['image', 'video'],
    example: 'image',
  })
  @IsEnum(['image', 'video'])
  type: 'image' | 'video';

  @ApiProperty({
    description: 'Alternative text for the media',
    required: false,
    example: 'Company logo',
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  alt?: string;
}

/**
 * LinkedIn article/link sharing DTO
 */
export class LinkedInArticleDto {
  @ApiProperty({
    description: 'URL of the article to share',
    example: 'https://example.com/blog/my-article',
  })
  @IsUrl()
  url: string;

  @ApiProperty({
    description: 'Custom title for the article preview',
    required: false,
    example: 'How to Build Better Products',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiProperty({
    description: 'Custom description for the article preview',
    required: false,
    example: 'Learn the best practices for product development...',
    maxLength: 256,
  })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  description?: string;
}

/**
 * LinkedIn visibility options
 */
export enum LinkedInVisibility {
  PUBLIC = 'PUBLIC',
  CONNECTIONS = 'CONNECTIONS',
}

/**
 * DTO for creating a LinkedIn post
 *
 * LinkedIn API Constraints:
 * - Text (commentary): max 3000 characters
 * - Supports images, videos, documents, and article links
 * - Multi-image posts support 2-20 images
 */
export class CreateLinkedInPostDto {
  @ApiProperty({
    description: 'The text content of the post',
    example:
      'Excited to announce our new product launch! After months of development, we are finally ready to share it with the world. #ProductLaunch #Innovation',
    maxLength: 3000,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(3000)
  text: string;

  @ApiProperty({
    description: 'Media attachments for the post',
    type: [LinkedInMediaDto],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LinkedInMediaDto)
  media?: LinkedInMediaDto[];

  @ApiProperty({
    description: 'Article/link to share with the post',
    type: LinkedInArticleDto,
    required: false,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => LinkedInArticleDto)
  article?: LinkedInArticleDto;

  @ApiProperty({
    description: 'Post visibility',
    enum: LinkedInVisibility,
    default: LinkedInVisibility.PUBLIC,
    required: false,
  })
  @IsOptional()
  @IsEnum(LinkedInVisibility)
  visibility?: LinkedInVisibility;
}
