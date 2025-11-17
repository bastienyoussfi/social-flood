/**
 * Options for posting to TikTok
 */
export interface TikTokPostOptions {
  title?: string;
  privacyLevel?: 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS' | 'SELF_ONLY';
  disableComment?: boolean;
  disableDuet?: boolean;
  disableStitch?: boolean;
  videoUrl: string;
  videoCoverTimestampMs?: number;
}

/**
 * Result from TikTok publish operation
 */
export interface TikTokPublishResult {
  publishId: string;
  platformPostId?: string;
  url?: string;
  status: 'PROCESSING' | 'PUBLISHED' | 'FAILED';
}

/**
 * Result from job processing (matches PlatformJobResult pattern)
 */
export interface TikTokJobResult {
  platformPostId: string;
  url: string;
}
