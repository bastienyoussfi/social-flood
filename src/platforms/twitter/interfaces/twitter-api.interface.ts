export interface TwitterTweetResponse {
  id: string;
  text: string;
}

export interface TwitterMediaUploadResponse {
  media_id_string: string;
  size: number;
  expires_after_secs?: number;
}

export interface TwitterErrorResponse {
  title: string;
  detail: string;
  type: string;
  status: number;
}

export interface TwitterPostResult {
  tweetId: string;
  url: string;
  text: string;
}

export interface TwitterMediaMetadata {
  url: string;
  type: 'image' | 'video';
  alt?: string;
}
