import {
  Controller,
  Get,
  Query,
  Res,
  HttpStatus,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import type { Response } from 'express';
import { PinterestOAuthService } from './pinterest-oauth.service';
import { getErrorMessage } from '../../common/utils/error.utils';

/**
 * Pinterest OAuth Controller
 * Handles OAuth 2.0 authorization flow endpoints
 *
 * Endpoints:
 * - GET /auth/pinterest/login - Initiates OAuth flow
 * - GET /auth/pinterest/callback - Handles OAuth callback
 */
@Controller('auth/pinterest')
export class PinterestOAuthController {
  private readonly logger = new Logger(PinterestOAuthController.name);

  constructor(private readonly oauthService: PinterestOAuthService) {}

  /**
   * Initiate Pinterest OAuth flow
   * Redirects user to Pinterest authorization page
   *
   * Query parameters:
   * - userId: Unique identifier for the user (required)
   *
   * Example: GET /auth/pinterest/login?userId=user@example.com
   */
  @Get('login')
  login(@Query('userId') userId: string, @Res() res: Response) {
    try {
      if (!userId) {
        throw new BadRequestException(
          'userId query parameter is required. Example: ?userId=user@example.com',
        );
      }

      this.logger.log(`Initiating OAuth flow for user: ${userId}`);

      // Generate authorization URL with state parameter
      const authUrl = this.oauthService.getAuthorizationUrl(userId);

      this.logger.log(`Redirecting to Pinterest authorization URL`);

      // Redirect user to Pinterest
      res.redirect(authUrl);
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      this.logger.error(`OAuth login failed: ${errorMessage}`);

      // Send error response
      res.status(HttpStatus.BAD_REQUEST).json({
        error: 'OAuth login failed',
        message: errorMessage,
      });
    }
  }

  /**
   * Handle Pinterest OAuth callback
   * Called by Pinterest after user authorizes the app
   *
   * Query parameters:
   * - code: Authorization code from Pinterest
   * - state: State parameter for CSRF protection
   *
   * Example: GET /auth/pinterest/callback?code=ABC123&state=XYZ789
   */
  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Query('error_description') errorDescription: string,
    @Res() res: Response,
  ): Promise<void> {
    try {
      // Check for OAuth errors
      if (error) {
        this.logger.error(`OAuth error: ${error} - ${errorDescription}`);
        res.status(HttpStatus.BAD_REQUEST).json({
          error: 'OAuth authorization failed',
          message: errorDescription || error,
        });
      }

      if (!code) {
        throw new BadRequestException('Authorization code is missing');
      }

      if (!state) {
        throw new BadRequestException('State parameter is missing');
      }

      // Validate state parameter
      const stateData = this.oauthService.validateState(state);
      if (!stateData) {
        throw new BadRequestException('Invalid or expired state parameter');
      }

      const { userId } = stateData;

      this.logger.log(`Processing OAuth callback for user: ${userId}`);

      // Exchange authorization code for access token
      const oauthToken = await this.oauthService.exchangeCodeForToken(
        code,
        userId,
      );

      this.logger.log(`Successfully authorized Pinterest for user: ${userId}`);

      // Success response
      res.status(HttpStatus.OK).json({
        success: true,
        message: 'Pinterest account connected successfully',
        data: {
          userId: oauthToken.userId,
          platform: oauthToken.platform,
          scopes: oauthToken.scopes,
          expiresAt: oauthToken.expiresAt,
          platformUserId: oauthToken.platformUserId,
          platformUsername: oauthToken.platformUsername,
        },
      });
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      this.logger.error(`OAuth callback failed: ${errorMessage}`);

      // Send error response
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: 'OAuth callback failed',
        message: errorMessage,
      });
    }
  }

  /**
   * Check OAuth connection status
   * Returns whether user has valid Pinterest token
   *
   * Query parameters:
   * - userId: Unique identifier for the user (required)
   *
   * Example: GET /auth/pinterest/status?userId=user@example.com
   */
  @Get('status')
  async status(
    @Query('userId') userId: string,
    @Res() res: Response,
  ): Promise<void> {
    try {
      if (!userId) {
        throw new BadRequestException(
          'userId query parameter is required. Example: ?userId=user@example.com',
        );
      }

      const hasValidToken = await this.oauthService.hasValidToken(userId);
      const token = hasValidToken
        ? await this.oauthService.getToken(userId)
        : null;

      res.status(HttpStatus.OK).json({
        connected: hasValidToken,
        userId,
        platform: 'pinterest',
        ...(token && {
          scopes: token.scopes,
          expiresAt: token.expiresAt,
          platformUserId: token.platformUserId,
          platformUsername: token.platformUsername,
        }),
      });
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      this.logger.error(`Status check failed: ${errorMessage}`);

      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: 'Status check failed',
        message: errorMessage,
      });
    }
  }

  /**
   * Disconnect Pinterest account
   * Revokes OAuth token for user
   *
   * Query parameters:
   * - userId: Unique identifier for the user (required)
   *
   * Example: GET /auth/pinterest/disconnect?userId=user@example.com
   */
  @Get('disconnect')
  async disconnect(
    @Query('userId') userId: string,
    @Res() res: Response,
  ): Promise<void> {
    try {
      if (!userId) {
        throw new BadRequestException(
          'userId query parameter is required. Example: ?userId=user@example.com',
        );
      }

      await this.oauthService.revokeToken(userId);

      this.logger.log(`Disconnected Pinterest for user: ${userId}`);

      res.status(HttpStatus.OK).json({
        success: true,
        message: 'Pinterest account disconnected successfully',
      });
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      this.logger.error(`Disconnect failed: ${errorMessage}`);

      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: 'Disconnect failed',
        message: errorMessage,
      });
    }
  }
}
