/**
 * Instagram Graph API Interfaces
 */

/**
 * Media container creation response
 */
export interface InstagramMediaContainerResponse {
  id: string;
}

/**
 * Media container status
 */
export type MediaContainerStatus =
  | 'EXPIRED'
  | 'ERROR'
  | 'FINISHED'
  | 'IN_PROGRESS'
  | 'PUBLISHED';

/**
 * Media container status response
 */
export interface InstagramMediaStatusResponse {
  id: string;
  status_code: MediaContainerStatus;
  status?: string;
}

/**
 * Media publish response
 */
export interface InstagramMediaPublishResponse {
  id: string;
}

/**
 * Instagram media object
 */
export interface InstagramMedia {
  id: string;
  media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  caption?: string;
  timestamp?: string;
  username?: string;
}

/**
 * Instagram user profile
 */
export interface InstagramUserProfile {
  id: string;
  username: string;
  name?: string;
  biography?: string;
  profile_picture_url?: string;
  followers_count?: number;
  follows_count?: number;
  media_count?: number;
  website?: string;
}

/**
 * Instagram API error response
 */
export interface InstagramApiError {
  error: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

/**
 * Create media container parameters
 */
export interface CreateMediaContainerParams {
  /**
   * Instagram Business Account ID
   */
  igUserId: string;

  /**
   * Access token for API calls
   */
  accessToken: string;

  /**
   * Image URL (required for image posts)
   */
  imageUrl?: string;

  /**
   * Video URL (required for video posts)
   */
  videoUrl?: string;

  /**
   * Post caption
   */
  caption?: string;

  /**
   * Location tag ID
   */
  locationId?: string;

  /**
   * User tags (for images only)
   */
  userTags?: InstagramUserTag[];

  /**
   * Media type (defaults to IMAGE if imageUrl provided, VIDEO if videoUrl provided)
   */
  mediaType?: 'IMAGE' | 'VIDEO' | 'REELS';

  /**
   * Cover URL for Reels
   */
  coverUrl?: string;

  /**
   * Share to feed (for Reels)
   */
  shareToFeed?: boolean;
}

/**
 * User tag for media
 */
export interface InstagramUserTag {
  username: string;
  x: number; // 0-1 coordinate
  y: number; // 0-1 coordinate
}

/**
 * Carousel item for multi-image posts
 */
export interface CarouselItem {
  /**
   * Media type
   */
  mediaType: 'IMAGE' | 'VIDEO';

  /**
   * Image URL (for images)
   */
  imageUrl?: string;

  /**
   * Video URL (for videos)
   */
  videoUrl?: string;

  /**
   * User tags (for images only)
   */
  userTags?: InstagramUserTag[];
}

/**
 * Create carousel container parameters
 */
export interface CreateCarouselContainerParams {
  /**
   * Instagram Business Account ID
   */
  igUserId: string;

  /**
   * Access token for API calls
   */
  accessToken: string;

  /**
   * Carousel children container IDs
   */
  children: string[];

  /**
   * Post caption
   */
  caption?: string;

  /**
   * Location tag ID
   */
  locationId?: string;
}

/**
 * Publish media parameters
 */
export interface PublishMediaParams {
  /**
   * Instagram Business Account ID
   */
  igUserId: string;

  /**
   * Access token for API calls
   */
  accessToken: string;

  /**
   * Media container ID to publish
   */
  creationId: string;
}

/**
 * Instagram post result
 */
export interface InstagramPostResult {
  /**
   * Published media ID
   */
  postId: string;

  /**
   * Post permalink URL
   */
  url: string;
}
