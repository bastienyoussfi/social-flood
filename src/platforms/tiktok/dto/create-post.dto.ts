import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  MaxLength,
  IsUrl,
  IsEnum,
  IsBoolean,
  IsNumber,
  Min,
} from 'class-validator';

/**
 * TikTok privacy level options
 */
export enum TikTokPrivacyLevel {
  PUBLIC_TO_EVERYONE = 'PUBLIC_TO_EVERYONE',
  MUTUAL_FOLLOW_FRIENDS = 'MUTUAL_FOLLOW_FRIENDS',
  SELF_ONLY = 'SELF_ONLY',
}

/**
 * DTO for creating a TikTok video post
 *
 * TikTok Content Posting API Constraints:
 * - Video: Required (only video posts supported)
 * - Caption: max 2200 characters
 * - Video duration: 3 seconds to 10 minutes
 * - Supports privacy settings, duet/stitch/comment controls
 */
export class CreateTikTokPostDto {
  @ApiProperty({
    description: 'URL of the video file to upload',
    example: 'https://example.com/video.mp4',
  })
  @IsUrl()
  @IsNotEmpty()
  videoUrl: string;

  @ApiProperty({
    description: 'Caption for the video',
    required: false,
    example: 'Check out this awesome video! #viral #fyp',
    maxLength: 2200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2200)
  caption?: string;

  @ApiProperty({
    description: 'TikTok user ID (required for OAuth posting)',
    example: '7234567890123456789',
  })
  @IsString()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({
    description: 'Privacy level for the video',
    enum: TikTokPrivacyLevel,
    default: TikTokPrivacyLevel.PUBLIC_TO_EVERYONE,
    required: false,
  })
  @IsOptional()
  @IsEnum(TikTokPrivacyLevel)
  privacyLevel?: TikTokPrivacyLevel;

  @ApiProperty({
    description: 'Disable comments on the video',
    required: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  disableComment?: boolean;

  @ApiProperty({
    description: 'Disable duet feature for this video',
    required: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  disableDuet?: boolean;

  @ApiProperty({
    description: 'Disable stitch feature for this video',
    required: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  disableStitch?: boolean;

  @ApiProperty({
    description: 'Video cover timestamp in milliseconds',
    required: false,
    example: 1000,
    minimum: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  videoCoverTimestampMs?: number;

  @ApiProperty({
    description: 'Title for the video (used for certain video types)',
    required: false,
    example: 'My Awesome Video',
    maxLength: 150,
  })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  title?: string;
}
