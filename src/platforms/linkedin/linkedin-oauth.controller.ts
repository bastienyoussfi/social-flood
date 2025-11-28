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
import { LinkedInOAuthService } from './linkedin-oauth.service';
import { getErrorMessage } from '../../common/utils/error.utils';

/**
 * LinkedIn OAuth Controller
 * Handles OAuth 2.0 authorization flow endpoints
 *
 * Endpoints:
 * - GET /auth/linkedin/login - Initiates OAuth flow
 * - GET /auth/linkedin/callback - Handles OAuth callback
 * - GET /auth/linkedin/status - Check connection status
 * - GET /auth/linkedin/disconnect - Revoke token
 */
@Controller('auth/linkedin')
export class LinkedInOAuthController {
  private readonly logger = new Logger(LinkedInOAuthController.name);

  constructor(private readonly oauthService: LinkedInOAuthService) {}

  /**
   * Initiate LinkedIn OAuth flow
   * Redirects user to LinkedIn authorization page
   *
   * Query parameters:
   * - userId: Unique identifier for the user (required)
   *
   * Example: GET /auth/linkedin/login?userId=user@example.com
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

      this.logger.log(`Redirecting to LinkedIn authorization URL`);

      // Redirect user to LinkedIn
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
   * Handle LinkedIn OAuth callback
   * Called by LinkedIn after user authorizes the app
   *
   * Query parameters:
   * - code: Authorization code from LinkedIn
   * - state: State parameter for CSRF protection
   *
   * Example: GET /auth/linkedin/callback?code=ABC123&state=XYZ789
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
        return;
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

      this.logger.log(`Successfully authorized LinkedIn for user: ${userId}`);

      // Success response
      res.status(HttpStatus.OK).json({
        success: true,
        message: 'LinkedIn account connected successfully',
        data: {
          userId: oauthToken.userId,
          platform: oauthToken.platform,
          scopes: oauthToken.scopes,
          expiresAt: oauthToken.expiresAt,
          platformUserId: oauthToken.platformUserId,
          platformUsername: oauthToken.platformUsername,
          personUrn: (oauthToken.metadata as Record<string, string>)?.personUrn,
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
   * Returns whether user has valid LinkedIn token
   *
   * Query parameters:
   * - userId: Unique identifier for the user (required)
   *
   * Example: GET /auth/linkedin/status?userId=user@example.com
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
        platform: 'linkedin',
        ...(token && {
          scopes: token.scopes,
          expiresAt: token.expiresAt,
          platformUserId: token.platformUserId,
          platformUsername: token.platformUsername,
          personUrn: (token.metadata as Record<string, string>)?.personUrn,
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
   * Disconnect LinkedIn account
   * Revokes OAuth token for user
   *
   * Query parameters:
   * - userId: Unique identifier for the user (required)
   *
   * Example: GET /auth/linkedin/disconnect?userId=user@example.com
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

      this.logger.log(`Disconnected LinkedIn for user: ${userId}`);

      res.status(HttpStatus.OK).json({
        success: true,
        message: 'LinkedIn account disconnected successfully',
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
