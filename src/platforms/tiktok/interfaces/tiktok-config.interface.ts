export interface TikTokConfig {
  clientKey: string;
  clientSecret: string;
  accessToken: string;
  refreshToken?: string;
  apiBaseUrl: string;
}

export const TIKTOK_API_VERSION = 'v2';
export const TIKTOK_API_BASE_URL = 'https://open.tiktokapis.com';
