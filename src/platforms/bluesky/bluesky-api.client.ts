import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BskyAgent, RichText } from '@atproto/api';
import {
  BlueskyConfig,
  BlueskySession,
} from './interfaces/bluesky-config.interface';
import {
  BlueskyBlobResponse,
  BlueskyBlobWithAlt,
  BlueskyPostResult,
} from './interfaces/bluesky-api.interface';
import type { AppBskyFeedPost } from '@atproto/api';
import { getErrorMessage, getErrorStack } from '../../common/utils/error.utils';

/**
 * Bluesky AT Protocol API Client
 * Handles all direct communication with Bluesky API
 * Uses app password authentication
 */
@Injectable()
export class BlueskyApiClient {
  private readonly logger = new Logger(BlueskyApiClient.name);
  private readonly config: BlueskyConfig;
  private agent: BskyAgent;
  private session: BlueskySession | null = null;

  constructor(private readonly configService: ConfigService) {
    this.config = this.loadConfig();
    this.initializeAgent();
  }

  /**
   * Load Bluesky configuration from environment
   */
  private loadConfig(): BlueskyConfig {
    const handle = this.configService.get<string>('BLUESKY_HANDLE') || '';
    const appPassword =
      this.configService.get<string>('BLUESKY_APP_PASSWORD') || '';
    const service =
      this.configService.get<string>('BLUESKY_SERVICE') ||
      'https://bsky.social';

    // Validate required credentials
    if (!handle || !appPassword) {
      throw new Error(
        'Bluesky credentials are not properly configured. ' +
          'Please set BLUESKY_HANDLE and BLUESKY_APP_PASSWORD',
      );
    }

    const config: BlueskyConfig = {
      handle,
      appPassword,
      service,
    };

    return config;
  }

  /**
   * Initialize Bluesky agent
   */
  private initializeAgent(): void {
    try {
      this.agent = new BskyAgent({
        service: this.config.service || 'https://bsky.social',
      });
      this.logger.log('Bluesky API client initialized successfully');
    } catch (error) {
      const errorStack = getErrorStack(error);
      this.logger.error('Failed to initialize Bluesky API client', errorStack);
      throw error;
    }
  }

  /**
   * Authenticate with Bluesky using app password
   * Creates a session that persists for subsequent requests
   */
  private async authenticate(): Promise<void> {
    try {
      if (this.session) {
        // Session already exists
        return;
      }

      this.logger.log(`Authenticating as ${this.config.handle}`);

      const response = await this.agent.login({
        identifier: this.config.handle,
        password: this.config.appPassword,
      });

      this.session = {
        did: response.data.did,
        handle: response.data.handle,
        email: response.data.email,
        accessJwt: response.data.accessJwt,
        refreshJwt: response.data.refreshJwt,
      };

      this.logger.log(
        `Authenticated successfully as ${this.session.handle} (${this.session.did})`,
      );
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      const errorStack = getErrorStack(error);
      this.logger.error('Failed to authenticate with Bluesky', errorStack);
      throw new Error(`Bluesky authentication failed: ${errorMessage}`);
    }
  }

  /**
   * Post content to Bluesky
   * @param text - Post text content
   * @param imageBlobs - Array of uploaded image blobs with alt text (optional)
   * @returns Post ID, URL, URI, and CID
   */
  async createPost(
    text: string,
    imageBlobs?: BlueskyBlobWithAlt[],
  ): Promise<BlueskyPostResult> {
    try {
      this.logger.log(
        `Creating Bluesky post: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`,
      );

      // Ensure we're authenticated
      await this.authenticate();

      if (!this.session) {
        throw new Error('No active Bluesky session');
      }

      // Process text for rich text features (links, mentions, hashtags)
      const richText = new RichText({ text });
      await richText.detectFacets(this.agent);

      // Build post data with proper typing
      const postData: Partial<AppBskyFeedPost.Record> &
        Pick<AppBskyFeedPost.Record, 'text' | 'createdAt'> = {
        text: richText.text,
        createdAt: new Date().toISOString(),
      };

      // Add facets if detected (links, mentions, hashtags)
      if (richText.facets && richText.facets.length > 0) {
        postData.facets = richText.facets;
      }

      // Add image embeds if provided
      // Note: We use type assertion here because the SDK expects BlobRef class instances,
      // but the AT Protocol API accepts plain JSON blob references
      if (imageBlobs && imageBlobs.length > 0) {
        postData.embed = {
          $type: 'app.bsky.embed.images',
          images: imageBlobs.map((blob) => ({
            alt: blob.alt,
            image: blob.blob,
          })),
        } as AppBskyFeedPost.Record['embed'];
        this.logger.log(`Attaching ${imageBlobs.length} image(s)`);
      }

      // Create the post
      const response = await this.agent.post(postData);

      if (!response.uri || !response.cid) {
        throw new Error('Bluesky API returned no URI or CID');
      }

      // Extract post ID from URI (format: at://did:plc:xxx/app.bsky.feed.post/xxx)
      const postId = this.extractPostIdFromUri(response.uri);
      const url = this.buildPostUrl(this.session.handle, postId);

      this.logger.log(`Bluesky post created successfully: ${url}`);

      return {
        postId,
        url,
        uri: response.uri,
        cid: response.cid,
      };
    } catch (error) {
      this.handleApiError(error);
    }
  }

  /**
   * Upload an image blob to Bluesky
   * @param imageBuffer - Image data as Buffer
   * @param mimeType - Image MIME type (e.g., 'image/jpeg')
   * @returns Blob response with reference
   */
  async uploadBlob(
    imageBuffer: Buffer,
    mimeType: string,
  ): Promise<BlueskyBlobResponse> {
    try {
      this.logger.log(
        `Uploading blob (${mimeType}, ${imageBuffer.length} bytes)`,
      );

      // Ensure we're authenticated
      await this.authenticate();

      // Upload blob
      const response = await this.agent.uploadBlob(imageBuffer, {
        encoding: mimeType,
      });

      const blobData = response.data?.blob;
      if (!blobData) {
        throw new Error('Bluesky API returned no blob data');
      }

      // Access the $link safely from the blob reference
      const blobRef = blobData.ref as { $link: string };
      this.logger.log(`Blob uploaded successfully: ${blobRef.$link}`);

      return {
        blob: {
          $type: 'blob',
          ref: blobData.ref as { $link: string },
          mimeType: blobData.mimeType,
          size: blobData.size,
        },
      };
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      const errorStack = getErrorStack(error);
      this.logger.error('Failed to upload blob to Bluesky', errorStack);
      throw new Error(`Bluesky blob upload failed: ${errorMessage}`);
    }
  }

  /**
   * Extract post ID from AT URI
   * @param uri - AT URI (e.g., at://did:plc:xxx/app.bsky.feed.post/3kxabc123)
   * @returns Post ID (the last segment)
   */
  private extractPostIdFromUri(uri: string): string {
    const parts = uri.split('/');
    return parts[parts.length - 1];
  }

  /**
   * Build Bluesky post URL from handle and post ID
   * @param handle - User handle (e.g., user.bsky.social)
   * @param postId - Post ID
   * @returns Public post URL
   */
  private buildPostUrl(handle: string, postId: string): string {
    return `https://bsky.app/profile/${handle}/post/${postId}`;
  }

  /**
   * Handle Bluesky API errors
   * Provides detailed error messages and logging
   */
  private handleApiError(error: unknown): never {
    const errorMessage = getErrorMessage(error);
    const errorStack = getErrorStack(error);

    this.logger.error('Bluesky API error', errorStack);

    // Check for specific error patterns
    if (
      errorMessage.includes('401') ||
      errorMessage.includes('authentication')
    ) {
      throw new Error(
        'Bluesky authentication failed. Please check your handle and app password.',
      );
    }

    if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
      throw new Error('Bluesky rate limit exceeded. Please try again later.');
    }

    if (errorMessage.includes('400') || errorMessage.includes('invalid')) {
      throw new Error(`Bluesky API validation error: ${errorMessage}`);
    }

    throw new Error(`Failed to post to Bluesky: ${errorMessage}`);
  }

  /**
   * Check if the client is properly configured
   */
  isConfigured(): boolean {
    return !!(this.config.handle && this.config.appPassword);
  }

  /**
   * Get the current session DID (Decentralized Identifier)
   */
  getSessionDid(): string | null {
    return this.session?.did || null;
  }

  /**
   * Get the current session handle
   */
  getSessionHandle(): string | null {
    return this.session?.handle || null;
  }
}
