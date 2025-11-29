import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  MaxLength,
  IsUrl,
} from 'class-validator';

/**
 * DTO for creating a Pinterest pin
 *
 * Pinterest API v5 Constraints:
 * - Title: max 100 characters
 * - Description: max 500 characters
 * - Image: Required (only image pins supported via this endpoint)
 * - Board ID: Required (pins must be saved to a board)
 * - Link: Optional destination URL
 */
export class CreatePinterestPostDto {
  @ApiProperty({
    description: 'Title of the pin',
    example: 'Amazing Recipe for Chocolate Cake',
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title: string;

  @ApiProperty({
    description: 'Description of the pin',
    example:
      'This delicious chocolate cake recipe is perfect for any occasion. Easy to make and absolutely divine!',
    maxLength: 500,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  description: string;

  @ApiProperty({
    description: 'URL of the image for the pin',
    example: 'https://example.com/cake.jpg',
  })
  @IsUrl()
  @IsNotEmpty()
  imageUrl: string;

  @ApiProperty({
    description: 'Pinterest board ID where the pin will be saved',
    example: '1234567890123456789',
  })
  @IsString()
  @IsNotEmpty()
  boardId: string;

  @ApiProperty({
    description: 'Destination link when users click on the pin',
    required: false,
    example: 'https://example.com/recipes/chocolate-cake',
  })
  @IsOptional()
  @IsUrl()
  link?: string;

  @ApiProperty({
    description: 'Alternative text for the pin image (for accessibility)',
    required: false,
    example: 'A delicious chocolate cake with chocolate frosting',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  altText?: string;
}
