/**
 * Reddit API Response Interfaces
 * Defines response structures from Reddit API endpoints
 */

/**
 * Reddit's maximum title length (in characters)
 */
export const REDDIT_MAX_TITLE_LENGTH = 300;

/**
 * Reddit's maximum text length for self posts (in characters)
 */
export const REDDIT_MAX_TEXT_LENGTH = 40000;

/**
 * Post result returned from Reddit after successful submission
 */
export interface RedditPostResult {
  /**
   * Full post ID with type prefix (e.g., "t3_abc123")
   * t3_ prefix indicates a link/post
   */
  postId: string;

  /**
   * Full URL to the posted content
   * Format: https://reddit.com/r/{subreddit}/comments/{id}/{title}/
   */
  url: string;
}

/**
 * Reddit media asset response
 * Returned from /api/media/asset.json endpoint
 */
export interface RedditMediaAssetResponse {
  /**
   * Upload action details (S3 upload URL and fields)
   */
  args: {
    /**
     * S3 upload URL
     */
    action: string;

    /**
     * Form fields required for S3 upload (multipart/form-data)
     */
    fields: Array<{
      name: string;
      value: string;
    }>;
  };

  /**
   * Asset metadata
   */
  asset: {
    /**
     * Unique asset identifier
     * Used to reference the uploaded media in post submission
     */
    asset_id: string;

    /**
     * WebSocket URL for real-time processing updates (optional)
     * Used for video processing status
     */
    websocket_url?: string;
  };
}

/**
 * Reddit submit endpoint response
 * Response structure from /api/submit
 */
export interface RedditSubmitResponse {
  /**
   * JSON response wrapper
   */
  json: {
    /**
     * Response data containing post information
     */
    data: {
      /**
       * Short post ID (without prefix)
       */
      id: string;

      /**
       * Full post name with type prefix (e.g., "t3_abc123")
       */
      name: string;

      /**
       * Full URL to the post
       */
      url: string;
    };

    /**
     * Array of errors (if any)
     * Format: [[error_code, error_message, field_name], ...]
     * Example: [["SUBREDDIT_NOEXIST", "that subreddit doesn't exist", "sr"]]
     */
    errors: Array<[string, string, string]>;
  };
}

/**
 * Supported media MIME types for Reddit uploads
 */
export type RedditMediaType =
  | 'image/png'
  | 'image/jpeg'
  | 'image/gif'
  | 'video/mp4'
  | 'video/quicktime';

/**
 * Reddit post kind (type)
 */
export enum RedditPostKind {
  /**
   * Text post (self post)
   */
  SELF = 'self',

  /**
   * Link post (URL or uploaded media)
   */
  LINK = 'link',
}

/**
 * Media upload result
 */
export interface RedditMediaUploadResult {
  /**
   * Uploaded media URL
   * This URL is used in the post submission
   */
  url: string;

  /**
   * Asset ID from Reddit
   */
  assetId: string;
}
