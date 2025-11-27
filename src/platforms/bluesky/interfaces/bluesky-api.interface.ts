/**
 * Bluesky API Response Interfaces
 * Based on AT Protocol (atproto) API
 */

/**
 * Bluesky post creation response
 */
export interface BlueskyPostResponse {
  uri: string; // AT URI format: at://did:plc:xxx/app.bsky.feed.post/xxx
  cid: string; // Content identifier
}

/**
 * Bluesky blob upload response
 */
export interface BlueskyBlobResponse {
  blob: {
    $type: string; // blob type
    ref: {
      $link: string; // CID reference
    };
    mimeType: string;
    size: number;
  };
}

/**
 * Bluesky blob response with alt text metadata
 * Used when uploading images to store alt text for later embedding
 */
export interface BlueskyBlobWithAlt extends BlueskyBlobResponse {
  alt: string;
}

/**
 * Bluesky image embed structure
 */
export interface BlueskyImageEmbed {
  $type: 'app.bsky.embed.images';
  images: Array<{
    alt: string;
    image: {
      $type: string;
      ref: {
        $link: string;
      };
      mimeType: string;
      size: number;
    };
    aspectRatio?: {
      width: number;
      height: number;
    };
  }>;
}

/**
 * Bluesky external link embed structure
 */
export interface BlueskyExternalEmbed {
  $type: 'app.bsky.embed.external';
  external: {
    uri: string;
    title: string;
    description: string;
    thumb?: {
      $type: string;
      ref: {
        $link: string;
      };
      mimeType: string;
      size: number;
    };
  };
}

/**
 * Bluesky facet (rich text feature like mentions, links)
 */
export interface BlueskyFacet {
  index: {
    byteStart: number;
    byteEnd: number;
  };
  features: Array<{
    $type: string;
    uri?: string; // For links
    did?: string; // For mentions
    tag?: string; // For hashtags
  }>;
}

/**
 * Bluesky post record structure
 */
export interface BlueskyPostRecord {
  $type: 'app.bsky.feed.post';
  text: string;
  createdAt: string; // ISO 8601 timestamp
  embed?: BlueskyImageEmbed | BlueskyExternalEmbed;
  facets?: BlueskyFacet[];
  langs?: string[]; // Language codes
}

/**
 * Bluesky error response structure
 */
export interface BlueskyErrorResponse {
  error: string;
  message: string;
}

/**
 * Bluesky post result returned to caller
 */
export interface BlueskyPostResult {
  postId: string; // Extracted from URI
  url: string; // Public URL
  uri: string; // AT URI
  cid: string; // Content identifier
}

/**
 * Maximum allowed values for Bluesky posts
 */
export const BLUESKY_MAX_TEXT_LENGTH = 300;
export const BLUESKY_MAX_IMAGES = 4;
export const BLUESKY_MAX_IMAGE_SIZE = 1000000; // 1MB in bytes
