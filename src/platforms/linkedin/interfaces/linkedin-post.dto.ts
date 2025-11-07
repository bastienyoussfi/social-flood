import {
  LinkedInVisibility,
  LinkedInDistributionFeed,
  LinkedInLifecycleState,
} from './linkedin-api.interface';

/**
 * LinkedIn Post Creation DTO
 * Represents the structure sent to LinkedIn REST API
 */
export interface LinkedInPostDto {
  author: string; // URN: urn:li:person:{id} or urn:li:organization:{id}
  commentary: string;
  visibility: LinkedInVisibility;
  distribution: {
    feedDistribution: LinkedInDistributionFeed;
  };
  content?: LinkedInContentDto;
  lifecycleState: LinkedInLifecycleState;
}

/**
 * LinkedIn content wrapper for media
 */
export interface LinkedInContentDto {
  media?: LinkedInMediaDto;
  multiImage?: LinkedInMultiImageDto;
  article?: LinkedInArticleDto;
}

/**
 * LinkedIn single media DTO
 */
export interface LinkedInMediaDto {
  id: string; // URN: urn:li:image:{id}
  altText?: string;
}

/**
 * LinkedIn multi-image DTO (2-20 images)
 */
export interface LinkedInMultiImageDto {
  images: LinkedInMediaDto[];
}

/**
 * LinkedIn article DTO
 */
export interface LinkedInArticleDto {
  source: string;
  title?: string;
  description?: string;
}

/**
 * LinkedIn image upload initialization request
 */
export interface LinkedInImageInitDto {
  initializeUploadRequest: {
    owner: string; // URN of the owner
  };
}
