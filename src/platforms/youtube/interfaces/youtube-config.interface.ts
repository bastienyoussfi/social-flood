export interface YoutubeConfig {
  clientId: string;
  clientSecret: string;
  accessToken: string;
  refreshToken: string;
}

export interface YoutubeOAuthTokens {
  access_token: string;
  refresh_token: string;
  scope: string;
  token_type: string;
  expiry_date: number;
}
