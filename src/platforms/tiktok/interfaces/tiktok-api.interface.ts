/**
 * TikTok API response interfaces based on Content Posting API v2
 */

export interface TikTokApiError {
  code: string;
  message: string;
  log_id: string;
}

/**
 * Response from creator info endpoint
 * GET /v2/post/publish/creator_info/query/
 */
export interface TikTokCreatorInfoResponse {
  data?: {
    creator_avatar_url: string;
    creator_username: string;
    creator_nickname: string;
    privacy_level_options: string[];
    comment_disabled: boolean;
    duet_disabled: boolean;
    stitch_disabled: boolean;
    max_video_post_duration_sec: number;
  };
  error?: TikTokApiError;
}

/**
 * Request body for direct post initialization
 */
export interface TikTokDirectPostInitRequest {
  post_info: {
    title?: string;
    privacy_level?:
      | 'PUBLIC_TO_EVERYONE'
      | 'MUTUAL_FOLLOW_FRIENDS'
      | 'SELF_ONLY';
    disable_comment?: boolean;
    disable_duet?: boolean;
    disable_stitch?: boolean;
    video_cover_timestamp_ms?: number;
  };
  source_info: {
    source: 'FILE_UPLOAD' | 'PULL_FROM_URL';
    video_url?: string;
    video_size?: number;
    chunk_size?: number;
    total_chunk_count?: number;
  };
}

/**
 * Response from direct post initialization
 * POST /v2/post/publish/video/init/
 */
export interface TikTokDirectPostInitResponse {
  data?: {
    publish_id: string;
    upload_url: string;
  };
  error?: TikTokApiError;
}

/**
 * Request body for checking publish status
 */
export interface TikTokPublishStatusRequest {
  publish_id: string;
}

/**
 * Response from publish status endpoint
 * POST /v2/post/publish/status/fetch/
 */
export interface TikTokPublishStatusResponse {
  data?: {
    status:
      | 'PROCESSING_UPLOAD'
      | 'SEND_TO_USER_INBOX'
      | 'PROCESSING_DOWNLOAD'
      | 'PUBLISH_COMPLETE'
      | 'PUBLISH_FAILED';
    publiclyAvailable?: boolean;
    downloadUrl?: string;
    fail_reason?: string;
  };
  error?: TikTokApiError;
}
