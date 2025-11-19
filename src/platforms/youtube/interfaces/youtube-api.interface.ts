export interface YoutubeVideoMetadata {
  title: string;
  description?: string;
  tags?: string[];
  categoryId?: string;
  privacyStatus: 'public' | 'unlisted' | 'private';
  madeForKids?: boolean;
}

export interface YoutubeVideoSnippet {
  title: string;
  description?: string;
  tags?: string[];
  categoryId?: string;
}

export interface YoutubeVideoStatus {
  privacyStatus: 'public' | 'unlisted' | 'private';
  madeForKids?: boolean;
  uploadStatus?: 'uploaded' | 'processed' | 'failed' | 'rejected';
  processingStatus?: 'processing' | 'succeeded' | 'failed' | 'terminated';
}

export interface YoutubeUploadInitResponse {
  uploadUrl: string;
}

export interface YoutubeUploadResponse {
  id: string;
  snippet?: YoutubeVideoSnippet;
  status?: YoutubeVideoStatus;
}

export interface YoutubeVideoResource {
  id: string;
  snippet: YoutubeVideoSnippet;
  status: YoutubeVideoStatus;
}

export interface YoutubeApiError {
  error: {
    code: number;
    message: string;
    errors?: Array<{
      domain: string;
      reason: string;
      message: string;
    }>;
  };
}

export interface YoutubeJobData {
  title: string;
  description?: string;
  tags?: string[];
  videoUrl: string;
  privacyStatus: 'public' | 'unlisted' | 'private';
  metadata?: {
    postId?: string;
    platformPostId?: string;
  };
}

export interface YoutubeJobResult {
  platformPostId: string;
  url: string;
}
