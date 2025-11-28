/**
 * Instagram Configuration Interface
 */
export interface InstagramConfig {
  /**
   * Meta App ID
   */
  appId: string;

  /**
   * Meta App Secret
   */
  appSecret: string;

  /**
   * OAuth Redirect URI
   */
  redirectUri: string;

  /**
   * Graph API Version
   */
  apiVersion: string;
}

/**
 * Instagram posting configuration
 */
export interface InstagramPostConfig {
  /**
   * Maximum caption length
   */
  maxCaptionLength: number;

  /**
   * Maximum hashtags per post
   */
  maxHashtags: number;

  /**
   * Supported image formats
   */
  supportedImageFormats: string[];

  /**
   * Supported video formats
   */
  supportedVideoFormats: string[];

  /**
   * Maximum image file size in bytes
   */
  maxImageSize: number;

  /**
   * Maximum video file size in bytes
   */
  maxVideoSize: number;

  /**
   * Maximum video duration in seconds
   */
  maxVideoDuration: number;

  /**
   * Minimum video duration in seconds
   */
  minVideoDuration: number;
}

/**
 * Default Instagram configuration values
 */
export const DEFAULT_INSTAGRAM_CONFIG: InstagramPostConfig = {
  maxCaptionLength: 2200,
  maxHashtags: 30,
  supportedImageFormats: ['jpeg', 'jpg', 'png'],
  supportedVideoFormats: ['mp4', 'mov'],
  maxImageSize: 8 * 1024 * 1024, // 8MB
  maxVideoSize: 100 * 1024 * 1024, // 100MB
  maxVideoDuration: 60, // 60 seconds for feed posts
  minVideoDuration: 3, // 3 seconds minimum
};
