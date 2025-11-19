/**
 * Reddit API Configuration Interface
 * Defines configuration structure for Reddit OAuth2 authentication
 */
export interface RedditConfig {
  /**
   * Reddit application client ID
   * Obtained from https://www.reddit.com/prefs/apps
   */
  clientId: string;

  /**
   * Reddit application client secret
   * Obtained from https://www.reddit.com/prefs/apps
   */
  clientSecret: string;

  /**
   * User-Agent string (required by Reddit API)
   * Format: AppName/Version (by /u/username)
   * Example: social-flood/1.0.0 (by /u/myusername)
   */
  userAgent: string;

  /**
   * Default subreddit for posts (optional)
   * Used when no subreddit is specified in the request
   * Example: "test"
   */
  defaultSubreddit?: string;
}

/**
 * Reddit OAuth2 Token Response
 * Response structure from token endpoint
 */
export interface RedditTokenResponse {
  /**
   * OAuth2 access token
   * Used in Authorization: bearer <token> header
   */
  access_token: string;

  /**
   * Token type (always "bearer" for Reddit)
   */
  token_type: string;

  /**
   * Token expiration time in seconds
   * Reddit tokens expire after 3600 seconds (1 hour)
   */
  expires_in: number;

  /**
   * Granted scopes (space-separated)
   * Example: "submit identity"
   */
  scope: string;
}
