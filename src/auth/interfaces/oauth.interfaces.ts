/**
 * OAuth Interfaces
 * Shared types for all OAuth implementations
 */

/**
 * Supported OAuth platforms
 */
export type OAuthPlatform =
  | 'twitter'
  | 'tiktok'
  | 'linkedin'
  | 'pinterest'
  | 'youtube';

/**
 * OAuth configuration for a platform
 */
export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
  authorizationUrl: string;
  tokenUrl: string;
  userInfoUrl?: string;
}

/**
 * Token response from OAuth provider
 */
export interface OAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_expires_in?: number;
  scope?: string;
  token_type?: string;
}

/**
 * User info from OAuth provider
 */
export interface OAuthUserInfo {
  id: string;
  username?: string;
  displayName?: string;
  email?: string;
  avatarUrl?: string;
  metadata?: Record<string, any>;
}

/**
 * State data stored during OAuth flow
 */
export interface OAuthStateData {
  userId: string;
  platform: OAuthPlatform;
  codeVerifier?: string; // For PKCE
  codeChallenge?: string; // For PKCE
  createdAt: Date;
}

/**
 * Result of initiating OAuth flow
 */
export interface OAuthInitResult {
  url: string;
  state: string;
}

/**
 * Result of OAuth callback handling
 */
export interface OAuthCallbackResult {
  success: boolean;
  userId: string;
  platform: OAuthPlatform;
  platformUserId: string;
  platformUsername?: string;
  scopes: string[];
  expiresAt?: Date;
  metadata?: Record<string, any>;
}

/**
 * OAuth status response
 */
export interface OAuthStatusResponse {
  connected: boolean;
  userId: string;
  platform: OAuthPlatform;
  platformUserId?: string;
  platformUsername?: string;
  scopes?: string[];
  expiresAt?: Date;
  needsRefresh?: boolean;
  isExpired?: boolean;
}

/**
 * Common OAuth error response
 */
export interface OAuthErrorResponse {
  error: string;
  message: string;
  platform: OAuthPlatform;
}
