import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsArray,
  IsOptional,
  ValidateNested,
  MaxLength,
  ArrayMaxSize,
  IsUrl,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Media attachment DTO for Twitter posts
 * Twitter supports up to 4 images or 1 video per tweet
 */
export class TwitterMediaDto {
  @ApiProperty({
    description: 'URL of the media file',
    example: 'https://example.com/image.jpg',
  })
  @IsUrl()
  url: string;

  @ApiProperty({
    description: 'Alternative text for the media (for accessibility)',
    required: false,
    example: 'A beautiful sunset over the ocean',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  alt?: string;
}

/**
 * DTO for creating a Twitter post (tweet)
 *
 * Twitter API Constraints:
 * - Text: max 280 characters
 * - Media: max 4 images OR 1 video
 * - Links count against character limit (shortened to 23 chars)
 */
export class CreateTwitterPostDto {
  @ApiProperty({
    description: 'The text content of the tweet',
    example: 'Check out our new product! #tech #innovation',
    maxLength: 280,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(280)
  text: string;

  @ApiProperty({
    description: 'Media attachments (max 4 images)',
    type: [TwitterMediaDto],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => TwitterMediaDto)
  media?: TwitterMediaDto[];
}
