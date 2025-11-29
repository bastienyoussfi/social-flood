import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsArray,
  IsOptional,
  ValidateNested,
  IsEnum,
  IsUrl,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Platform } from '../../common/interfaces';

export class MediaDto {
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
    example: 'A beautiful sunset',
  })
  @IsOptional()
  @IsString()
  alt?: string;
}

export class CreatePostDto {
  @ApiProperty({
    description: 'The text content of the post',
    example: 'Check out our new product! #tech #innovation',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(3000)
  text: string;

  @ApiProperty({
    description: 'Media attachments for the post',
    type: [MediaDto],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MediaDto)
  media?: MediaDto[];

  @ApiProperty({
    description: 'Link to include with the post',
    required: false,
    example: 'https://example.com',
  })
  @IsOptional()
  @IsUrl()
  link?: string;

  @ApiProperty({
    description: 'Platforms to post to',
    enum: Platform,
    isArray: true,
    example: [
      Platform.LINKEDIN,
      Platform.TWITTER,
      Platform.BLUESKY,
      Platform.TIKTOK,
    ],
  })
  @IsArray()
  @IsEnum(Platform, { each: true })
  platforms: Platform[];
}
