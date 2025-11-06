export interface TwitterConfig {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessTokenSecret: string;
  bearerToken?: string;
}

export interface TwitterAuthCredentials {
  appKey: string;
  appSecret: string;
  accessToken: string;
  accessSecret: string;
}
