import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PinterestConfig,
  PinterestPinRequest,
  PinterestPinResponse,
  PinterestPostResult,
  PinterestErrorResponse,
  PINTEREST_API_BASE_URL,
} from './interfaces';
import { getErrorMessage, getErrorStack } from '../../common/utils/error.utils';
import { PinterestOAuthService } from './pinterest-oauth.service';

/**
 * Pinterest API Client
 * Handles all direct communication with Pinterest API v5
 * Supports both OAuth 2.0 tokens from database and legacy env variable tokens
 */
@Injectable()
export class PinterestApiClient {
  private readonly logger = new Logger(PinterestApiClient.name);
  private readonly config: PinterestConfig;
  private readonly baseUrl = PINTEREST_API_BASE_URL;

  constructor(
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => PinterestOAuthService))
    private readonly oauthService: PinterestOAuthService,
  ) {
    this.config = this.loadConfig();
    this.validateConfig();
  }

  /**
   * Load Pinterest configuration from environment
   */
  private loadConfig(): PinterestConfig {
    const appId = this.configService.get<string>('PINTEREST_APP_ID') || '';
    const appSecret = this.configService.get<string>('PINTEREST_APP_SECRET');
    const accessToken = this.configService.get<string>('PINTEREST_ACCESS_TOKEN');
    const boardId = this.configService.get<string>('PINTEREST_BOARD_ID');

    return {
      appId,
      appSecret,
      accessToken,
      boardId,
    };
  }

  /**
   * Validate required configuration
   */
  private validateConfig(): void {
    if (!this.config.appId) {
      this.logger.warn(
        'PINTEREST_APP_ID is not set. This may be required for some API operations.',
      );
    }

    if (!this.config.accessToken) {
      this.logger.warn(
        'PINTEREST_ACCESS_TOKEN is not set. You will need to implement OAuth 2.0 flow to obtain an access token.',
      );
    }

    if (!this.config.boardId) {
      this.logger.warn(
        'PINTEREST_BOARD_ID is not set. Board ID will need to be provided for each pin.',
      );
    } else {
      this.logger.log('Pinterest API client initialized successfully');
    }
  }

  /**
   * Create a pin on Pinterest
   * @param title - Pin title (max 100 chars)
   * @param description - Pin description (max 500 chars)
   * @param imageUrl - URL of the image to pin
   * @param link - Optional link URL
   * @param boardId - Board ID (uses default if not provided)
   * @param userId - User ID for OAuth token (optional, uses env token if not provided)
   * @returns Pin ID and URL
   */
  async createPin(
    title: string,
    description: string,
    imageUrl: string,
    link?: string,
    boardId?: string,
    userId?: string,
  ): Promise<PinterestPostResult> {
    try {
      this.logger.log(
        `Creating Pinterest pin: "${title.substring(0, 50)}${title.length > 50 ? '...' : ''}"`,
      );

      // Get access token (OAuth or environment variable)
      const accessToken = await this.getAccessTokenForUser(userId);
      if (!accessToken) {
        throw new Error(
          'Pinterest access token is not available. Please connect Pinterest account via OAuth or set PINTEREST_ACCESS_TOKEN.',
        );
      }

      const targetBoardId = boardId || this.config.boardId;
      if (!targetBoardId) {
        throw new Error(
          'Pinterest board ID is not configured. Please set PINTEREST_BOARD_ID or provide boardId parameter.',
        );
      }

      // Build pin request
      const pinRequest: PinterestPinRequest = {
        board_id: targetBoardId,
        title: title.substring(0, 100), // Pinterest max 100 chars
        description: description.substring(0, 500), // Pinterest max 500 chars
        media_source: {
          source_type: 'image_url',
          url: imageUrl,
        },
      };

      // Add link if provided
      if (link) {
        pinRequest.link = link;
      }

      this.logger.log(
        `Posting to board ${targetBoardId} with image from ${imageUrl}`,
      );

      // Make API request
      const response = await fetch(`${this.baseUrl}/pins`, {
        method: 'POST',
        headers: this.getHeaders(accessToken),
        body: JSON.stringify(pinRequest),
      });

      // Handle response
      if (!response.ok) {
        await this.handleApiError(response);
      }

      const pinData: PinterestPinResponse = await response.json();

      if (!pinData.id) {
        throw new Error('Pinterest API returned no pin ID');
      }

      const url = this.buildPinUrl(pinData.id);

      this.logger.log(`Pinterest pin created successfully: ${url}`);

      return {
        postId: pinData.id,
        url,
      };
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Get access token for user (OAuth or fallback to env variable)
   */
  private async getAccessTokenForUser(userId?: string): Promise<string | null> {
    // If userId provided, try to get OAuth token
    if (userId) {
      const oauthToken = await this.oauthService.getAccessToken(userId);
      if (oauthToken) {
        this.logger.log(`Using OAuth token for user: ${userId}`);
        return oauthToken;
      }
      this.logger.warn(`No OAuth token found for user: ${userId}, falling back to env variable`);
    }

    // Fallback to environment variable
    if (this.config.accessToken) {
      this.logger.log('Using access token from environment variable');
      return this.config.accessToken;
    }

    return null;
  }

  /**
   * Get standard headers for Pinterest API requests
   */
  private getHeaders(accessToken: string): Record<string, string> {
    return {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Build Pinterest pin URL from pin ID
   * @param pinId - Pinterest pin ID
   * @returns Pin URL
   */
  private buildPinUrl(pinId: string): string {
    // Pinterest pin URLs follow the pattern:
    // https://www.pinterest.com/pin/{id}
    return `https://www.pinterest.com/pin/${pinId}`;
  }

  /**
   * Handle Pinterest API errors
   */
  private async handleApiError(response: Response): Promise<never> {
    let errorData: PinterestErrorResponse;

    try {
      errorData = (await response.json()) as PinterestErrorResponse;
    } catch {
      errorData = {
        code: response.status,
        message: response.statusText || 'Unknown error',
      };
    }

    const errorMessage = errorData.message || 'Unknown Pinterest API error';
    const statusCode = errorData.code || response.status;

    this.logger.error(
      `Pinterest API Error (${statusCode}): ${errorMessage}`,
      JSON.stringify(errorData, null, 2),
    );

    // Handle specific error codes
    if (statusCode === 429) {
      throw new Error('Pinterest rate limit exceeded. Please try again later.');
    }

    if (statusCode === 401 || statusCode === 403) {
      throw new Error(
        'Pinterest authentication failed. Please check your access token and permissions.',
      );
    }

    if (statusCode === 400) {
      throw new Error(`Pinterest API validation error: ${errorMessage}`);
    }

    throw new Error(`Pinterest API error (${statusCode}): ${errorMessage}`);
  }

  /**
   * Handle generic errors
   */
  private handleError(error: unknown): never {
    const errorMessage = getErrorMessage(error);
    const errorStack = getErrorStack(error);

    this.logger.error('Unexpected error posting to Pinterest', errorStack);
    throw new Error(`Failed to post to Pinterest: ${errorMessage}`);
  }

  /**
   * Check if the client is properly configured
   */
  isConfigured(): boolean {
    return !!(
      this.config.appId &&
      this.config.accessToken &&
      this.config.boardId
    );
  }

  /**
   * Get access token for media service
   */
  getAccessToken(): string {
    return this.config.accessToken;
  }

  /**
   * Get default board ID
   */
  getBoardId(): string | undefined {
    return this.config.boardId;
  }
}
