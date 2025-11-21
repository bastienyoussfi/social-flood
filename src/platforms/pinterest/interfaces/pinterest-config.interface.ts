/**
 * Pinterest OAuth 2.0 Configuration
 */
export interface PinterestConfig {
  appId: string;
  appSecret?: string;
  boardId?: string; // Default board ID for pins
}

/**
 * Pinterest OAuth 2.0 token response
 */
export interface PinterestAuthToken {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
}
