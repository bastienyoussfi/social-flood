/**
 * LinkedIn API Response Interfaces
 * Based on LinkedIn REST API v2 (2025)
 */

/**
 * LinkedIn post creation response
 */
export interface LinkedInPostResponse {
  id: string; // URN format: urn:li:share:{id}
}

/**
 * LinkedIn image upload initialization response
 */
export interface LinkedInImageUploadInit {
  value: {
    uploadUrl: string;
    image: string; // URN format: urn:li:image:{id}
  };
}

/**
 * LinkedIn error response structure
 */
export interface LinkedInErrorResponse {
  status: number;
  code?: string;
  message: string;
  serviceErrorCode?: number;
}

/**
 * LinkedIn post result returned to caller
 */
export interface LinkedInPostResult {
  postId: string;
  url: string;
  urn: string;
}

/**
 * LinkedIn visibility options
 */
export enum LinkedInVisibility {
  PUBLIC = 'PUBLIC',
  CONNECTIONS = 'CONNECTIONS',
}

/**
 * LinkedIn distribution feed types
 */
export enum LinkedInDistributionFeed {
  MAIN_FEED = 'MAIN_FEED',
  NONE = 'NONE',
}

/**
 * LinkedIn lifecycle state
 */
export enum LinkedInLifecycleState {
  PUBLISHED = 'PUBLISHED',
  DRAFT = 'DRAFT',
}

/**
 * LinkedIn API version format (YYYYMM)
 */
export const LINKEDIN_API_VERSION = '202510';

/**
 * LinkedIn REST API protocol version
 */
export const LINKEDIN_PROTOCOL_VERSION = '2.0.0';
