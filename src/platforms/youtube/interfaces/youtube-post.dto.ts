import { IsString, IsOptional, IsArray, IsEnum, MaxLength, IsBoolean } from 'class-validator';

export class YoutubePostDto {
  @IsString()
  @MaxLength(100, { message: 'YouTube video title must not exceed 100 characters' })
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000, { message: 'YouTube video description must not exceed 5000 characters' })
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsString()
  videoUrl: string;

  @IsOptional()
  @IsEnum(['public', 'unlisted', 'private'])
  privacyStatus?: 'public' | 'unlisted' | 'private';

  @IsOptional()
  @IsBoolean()
  madeForKids?: boolean;

  @IsOptional()
  @IsString()
  categoryId?: string;
}
