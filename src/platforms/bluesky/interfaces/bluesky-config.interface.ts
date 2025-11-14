/**
 * Bluesky AT Protocol Configuration
 */
export interface BlueskyConfig {
  handle: string; // e.g., user.bsky.social
  appPassword: string;
  service?: string; // Default: https://bsky.social
}

/**
 * Bluesky session information
 */
export interface BlueskySession {
  did: string; // Decentralized identifier
  handle: string;
  email?: string;
  accessJwt: string;
  refreshJwt: string;
}
