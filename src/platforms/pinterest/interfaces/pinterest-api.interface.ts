/**
 * Pinterest API Response Interfaces
 * Based on Pinterest API v5
 */

/**
 * Pinterest pin creation response
 */
export interface PinterestPinResponse {
  id: string;
  created_at: string;
  link?: string;
  title?: string;
  description?: string;
  board_id: string;
  media?: {
    media_type: string;
    images?: {
      [key: string]: {
        url: string;
        width: number;
        height: number;
      };
    };
  };
}

/**
 * Pinterest pin creation request
 */
export interface PinterestPinRequest {
  board_id: string;
  title?: string;
  description?: string;
  link?: string;
  media_source: {
    source_type: 'image_url' | 'image_base64';
    url?: string;
    content_type?: string;
    data?: string;
  };
}

/**
 * Pinterest error response structure
 */
export interface PinterestErrorResponse {
  code: number;
  message: string;
}

/**
 * Pinterest post result returned to caller
 */
export interface PinterestPostResult {
  postId: string;
  url: string;
}

/**
 * Pinterest API version
 */
export const PINTEREST_API_VERSION = 'v5';

/**
 * Pinterest API base URL
 */
export const PINTEREST_API_BASE_URL = 'https://api.pinterest.com/v5';
