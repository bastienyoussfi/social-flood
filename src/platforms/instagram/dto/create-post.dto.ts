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
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Media type for Instagram posts
 */
export enum InstagramMediaType {
  IMAGE = 'image',
  VIDEO = 'video',
}

/**
 * Media attachment DTO for Instagram posts
 */
export class InstagramMediaDto {
  @ApiProperty({
    description: 'URL of the media file',
    example: 'https://example.com/photo.jpg',
  })
  @IsUrl()
  url: string;

  @ApiProperty({
    description: 'Type of media',
    enum: InstagramMediaType,
    example: InstagramMediaType.IMAGE,
  })
  @IsEnum(InstagramMediaType)
  type: InstagramMediaType;

  @ApiProperty({
    description: 'Alternative text for the media (for accessibility)',
    required: false,
    example: 'A beautiful sunset at the beach',
  })
  @IsOptional()
  @IsString()
  alt?: string;
}

/**
 * DTO for creating an Instagram post
 *
 * Instagram Graph API Constraints:
 * - Caption: max 2200 characters
 * - Hashtags: max 30 per post
 * - Media: Required (1-10 items for carousel, or single image/video)
 * - User ID: Required for OAuth posting
 *
 * Supported post types:
 * - Single image
 * - Single video (Reels)
 * - Carousel (2-10 images/videos)
 */
export class CreateInstagramPostDto {
  @ApiProperty({
    description: 'Caption for the post',
    required: false,
    example:
      'Beautiful sunset at the beach! 🌅 #sunset #beach #photography #travel',
    maxLength: 2200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2200)
  caption?: string;

  @ApiProperty({
    description: 'Media attachments (1-10 items)',
    type: [InstagramMediaDto],
    minItems: 1,
    maxItems: 10,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => InstagramMediaDto)
  media: InstagramMediaDto[];

  @ApiProperty({
    description: 'Instagram user ID (required for OAuth posting)',
    example: 'user@example.com',
  })
  @IsString()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({
    description: 'Location ID to tag in the post',
    required: false,
    example: '123456789',
  })
  @IsOptional()
  @IsString()
  locationId?: string;

  @ApiProperty({
    description: 'Cover URL for video posts (thumbnail)',
    required: false,
    example: 'https://example.com/cover.jpg',
  })
  @IsOptional()
  @IsUrl()
  coverUrl?: string;

  @ApiProperty({
    description: 'Share to Facebook (if accounts are linked)',
    required: false,
    default: false,
  })
  @IsOptional()
  shareToFacebook?: boolean;
}
