import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  LinkedInConfig,
  LinkedInPostDto,
  LinkedInPostResult,
  LinkedInVisibility,
  LinkedInDistributionFeed,
  LinkedInLifecycleState,
  LinkedInErrorResponse,
  LINKEDIN_API_VERSION,
  LINKEDIN_PROTOCOL_VERSION,
} from './interfaces';
import { getErrorMessage, getErrorStack } from '../../common/utils/error.utils';

/**
 * LinkedIn API Client
 * Handles all direct communication with LinkedIn REST API v2
 * Uses OAuth 2.0 for authentication
 */
@Injectable()
export class LinkedInApiClient {
  private readonly logger = new Logger(LinkedInApiClient.name);
  private readonly config: LinkedInConfig;
  private readonly baseUrl = 'https://api.linkedin.com';

  constructor(private readonly configService: ConfigService) {
    this.config = this.loadConfig();
    this.validateConfig();
  }

  /**
   * Load LinkedIn configuration from environment
   */
  private loadConfig(): LinkedInConfig {
    const clientId = this.configService.get<string>('LINKEDIN_CLIENT_ID') || '';
    const clientSecret =
      this.configService.get<string>('LINKEDIN_CLIENT_SECRET') || '';
    const accessToken = this.configService.get<string>('LINKEDIN_ACCESS_TOKEN');
    const personUrn = this.configService.get<string>('LINKEDIN_PERSON_URN');

    return {
      clientId,
      clientSecret,
      accessToken,
      personUrn,
    };
  }

  /**
   * Validate required configuration
   */
  private validateConfig(): void {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error(
        'LinkedIn OAuth credentials are not properly configured. ' +
          'Please set LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET',
      );
    }

    if (!this.config.accessToken) {
      this.logger.warn(
        'LINKEDIN_ACCESS_TOKEN is not set. You will need to implement OAuth 2.0 flow to obtain an access token.',
      );
    }

    if (!this.config.personUrn) {
      this.logger.warn(
        'LINKEDIN_PERSON_URN is not set. Posts will require author URN to be provided.',
      );
    }

    this.logger.log('LinkedIn API client initialized successfully');
  }

  /**
   * Post content to LinkedIn
   * @param commentary - Post text content
   * @param mediaUrns - Array of uploaded media URNs (optional)
   * @returns Post ID and URL
   */
  async createPost(
    commentary: string,
    mediaUrns?: string[],
  ): Promise<LinkedInPostResult> {
    try {
      this.logger.log(
        `Creating LinkedIn post: "${commentary.substring(0, 50)}${commentary.length > 50 ? '...' : ''}"`,
      );

      if (!this.config.accessToken) {
        throw new Error(
          'LinkedIn access token is not configured. Please set LINKEDIN_ACCESS_TOKEN.',
        );
      }

      if (!this.config.personUrn) {
        throw new Error(
          'LinkedIn person URN is not configured. Please set LINKEDIN_PERSON_URN.',
        );
      }

      // Build post DTO
      const postDto: LinkedInPostDto = {
        author: this.config.personUrn,
        commentary,
        visibility: LinkedInVisibility.PUBLIC,
        distribution: {
          feedDistribution: LinkedInDistributionFeed.MAIN_FEED,
        },
        lifecycleState: LinkedInLifecycleState.PUBLISHED,
      };

      // Add media if provided
      if (mediaUrns && mediaUrns.length > 0) {
        if (mediaUrns.length === 1) {
          // Single image
          postDto.content = {
            media: {
              id: mediaUrns[0],
            },
          };
          this.logger.log(`Attaching 1 media item`);
        } else if (mediaUrns.length > 1) {
          // Multiple images (2-20 supported)
          const maxImages = 20;
          const limitedUrns = mediaUrns.slice(0, maxImages);
          postDto.content = {
            multiImage: {
              images: limitedUrns.map((urn) => ({ id: urn })),
            },
          };
          this.logger.log(`Attaching ${limitedUrns.length} media items`);
        }
      }

      // Make API request
      const response = await fetch(`${this.baseUrl}/rest/posts`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(postDto),
      });

      // Handle response
      if (!response.ok) {
        await this.handleApiError(response);
      }

      // Get post URN from response header
      const postUrn = response.headers.get('x-restli-id');
      if (!postUrn) {
        throw new Error('LinkedIn API returned no post URN');
      }

      // Extract post ID from URN (format: urn:li:share:{id})
      const postId = this.extractIdFromUrn(postUrn);
      const url = this.buildPostUrl(postId);

      this.logger.log(`LinkedIn post created successfully: ${url}`);

      return {
        postId,
        url,
        urn: postUrn,
      };
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Get standard headers for LinkedIn API requests
   */
  private getHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.config.accessToken}`,
      'LinkedIn-Version': LINKEDIN_API_VERSION,
      'X-Restli-Protocol-Version': LINKEDIN_PROTOCOL_VERSION,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Extract ID from LinkedIn URN
   * @param urn - LinkedIn URN (e.g., urn:li:share:123456)
   * @returns Extracted ID
   */
  private extractIdFromUrn(urn: string): string {
    const parts = urn.split(':');
    return parts[parts.length - 1];
  }

  /**
   * Build LinkedIn post URL from post ID
   * @param postId - LinkedIn post ID
   * @returns Post URL
   */
  private buildPostUrl(postId: string): string {
    // LinkedIn post URLs follow the pattern:
    // https://www.linkedin.com/feed/update/urn:li:share:{id}
    return `https://www.linkedin.com/feed/update/urn:li:share:${postId}`;
  }

  /**
   * Handle LinkedIn API errors
   */
  private async handleApiError(response: Response): Promise<never> {
    let errorData: LinkedInErrorResponse;

    try {
      errorData = (await response.json()) as LinkedInErrorResponse;
    } catch {
      errorData = {
        status: response.status,
        message: response.statusText || 'Unknown error',
      };
    }

    const errorMessage = errorData.message || 'Unknown LinkedIn API error';
    const statusCode = errorData.status || response.status;

    this.logger.error(
      `LinkedIn API Error (${statusCode}): ${errorMessage}`,
      JSON.stringify(errorData, null, 2),
    );

    // Handle specific error codes
    if (statusCode === 429) {
      throw new Error('LinkedIn rate limit exceeded. Please try again later.');
    }

    if (statusCode === 401 || statusCode === 403) {
      throw new Error(
        'LinkedIn authentication failed. Please check your access token and permissions.',
      );
    }

    if (statusCode === 400) {
      throw new Error(`LinkedIn API validation error: ${errorMessage}`);
    }

    throw new Error(`LinkedIn API error (${statusCode}): ${errorMessage}`);
  }

  /**
   * Handle generic errors
   */
  private handleError(error: unknown): never {
    const errorMessage = getErrorMessage(error);
    const errorStack = getErrorStack(error);

    this.logger.error('Unexpected error posting to LinkedIn', errorStack);
    throw new Error(`Failed to post to LinkedIn: ${errorMessage}`);
  }

  /**
   * Check if the client is properly configured
   */
  isConfigured(): boolean {
    return !!(
      this.config.clientId &&
      this.config.clientSecret &&
      this.config.accessToken &&
      this.config.personUrn
    );
  }

  /**
   * Get the base API URL for media operations
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Get access token for media service
   */
  getAccessToken(): string | undefined {
    return this.config.accessToken;
  }

  /**
   * Get person URN for media ownership
   */
  getPersonUrn(): string | undefined {
    return this.config.personUrn;
  }
}
