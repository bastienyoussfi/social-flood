export enum PostStatus {
  QUEUED = 'queued',
  POSTED = 'posted',
  FAILED = 'failed',
}

export enum Platform {
  LINKEDIN = 'linkedin',
  TWITTER = 'twitter',
  BLUESKY = 'bluesky',
  TIKTOK = 'tiktok',
  PINTEREST = 'pinterest',
  INSTAGRAM = 'instagram',
}

export interface MediaAttachment {
  url: string;
  type: 'image' | 'video';
  alt?: string;
}

export interface PostContent {
  text: string;
  media?: MediaAttachment[];
  link?: string;
  metadata?: Record<string, unknown>;
}

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

export interface PostResult {
  jobId: string;
  platformPostId?: string;
  status: PostStatus;
  platform: Platform;
  error?: string;
  url?: string;
}

export interface PlatformAdapter {
  /**
   * Post content to the platform
   */
  post(content: PostContent): Promise<PostResult>;

  /**
   * Validate content against platform requirements
   */
  validateContent(content: PostContent): ValidationResult;

  /**
   * Get the status of a posted content
   */
  getPostStatus(jobId: string): Promise<PostResult>;
}
