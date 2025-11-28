import {
  Controller,
  Get,
  Delete,
  Query,
  Param,
  Res,
  Logger,
  BadRequestException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { PinterestOAuthService } from '../services/pinterest-oauth.service';
import { getErrorMessage } from '../../common/utils/error.utils';

/**
 * Pinterest OAuth Controller
 * Handles OAuth 2.0 flow endpoints
 *
 * Endpoints:
 * - GET /api/auth/pinterest/login?userId=xxx - Initiate OAuth flow
 * - GET /api/auth/pinterest/callback - Handle OAuth callback
 * - GET /api/auth/pinterest/status?userId=xxx - Check connection status
 * - DELETE /api/auth/pinterest/:userId - Disconnect user
 * - GET /api/auth/pinterest/users - List all authenticated users (admin)
 */
@Controller('api/auth/pinterest')
export class PinterestOAuthController {
  private readonly logger = new Logger(PinterestOAuthController.name);

  constructor(private readonly oauthService: PinterestOAuthService) {}

  /**
   * Initiate Pinterest OAuth flow
   * Redirects user to Pinterest authorization page
   *
   * GET /api/auth/pinterest/login?userId=xxx
   */
  @Get('login')
  login(@Query('userId') userId: string, @Res() res: Response) {
    try {
      if (!userId) {
        throw new BadRequestException(
          'userId query parameter is required. Example: ?userId=user@example.com',
        );
      }

      if (!this.oauthService.isConfigured()) {
        throw new BadRequestException(
          'Pinterest OAuth is not configured. Please set PINTEREST_APP_ID and PINTEREST_APP_SECRET.',
        );
      }

      this.logger.log(`Initiating OAuth flow for user: ${userId}`);

      const { url } = this.oauthService.getAuthorizationUrl(userId);

      this.logger.log('Redirecting user to Pinterest authorization page');

      return res.redirect(url);
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      this.logger.error(`OAuth login failed: ${errorMessage}`);

      res.status(HttpStatus.BAD_REQUEST).json({
        error: 'OAuth login failed',
        message: errorMessage,
        platform: 'pinterest',
      });
    }
  }

  /**
   * Handle Pinterest OAuth callback
   * Called by Pinterest after user authorizes the app
   *
   * GET /api/auth/pinterest/callback?code=xxx&state=xxx
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
          platform: 'pinterest',
        });
        return;
      }

      if (!code) {
        throw new BadRequestException('Authorization code is missing');
      }

      if (!state) {
        throw new BadRequestException('State parameter is missing');
      }

      this.logger.log('Processing OAuth callback...');

      const result = await this.oauthService.exchangeCodeForToken(code, state);

      this.logger.log(
        `Successfully authenticated Pinterest user: ${result.platformUsername}`,
      );

      // Return JSON response
      res.status(HttpStatus.OK).json({
        success: true,
        message: 'Pinterest account connected successfully',
        data: {
          userId: result.userId,
          platform: result.platform,
          platformUserId: result.platformUserId,
          platformUsername: result.platformUsername,
          scopes: result.scopes,
          expiresAt: result.expiresAt,
        },
      });
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      this.logger.error(`OAuth callback failed: ${errorMessage}`);

      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: 'OAuth callback failed',
        message: errorMessage,
        platform: 'pinterest',
      });
    }
  }

  /**
   * Check OAuth connection status
   *
   * GET /api/auth/pinterest/status?userId=xxx
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

      const statusResponse = await this.oauthService.getStatus(userId);

      res.status(HttpStatus.OK).json(statusResponse);
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      this.logger.error(`Status check failed: ${errorMessage}`);

      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: 'Status check failed',
        message: errorMessage,
        platform: 'pinterest',
      });
    }
  }

  /**
   * List all authenticated Pinterest users (admin endpoint)
   *
   * GET /api/auth/pinterest/users
   */
  @Get('users')
  async listAuthenticatedUsers(@Res() res: Response): Promise<void> {
    try {
      const users = await this.oauthService.getAllAuthenticatedUsers();

      res.status(HttpStatus.OK).json({
        count: users.length,
        platform: 'pinterest',
        users: users.map((user) => ({
          userId: user.userId,
          platformUserId: user.platformUserId,
          platformUsername: user.platformUsername,
          scopes: user.scopes,
          expiresAt: user.expiresAt,
          createdAt: user.createdAt,
          isExpired: user.isExpired(),
          needsRefresh: user.needsRefresh(),
        })),
      });
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      this.logger.error(`Failed to list users: ${errorMessage}`);

      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: 'Failed to list users',
        message: errorMessage,
        platform: 'pinterest',
      });
    }
  }

  /**
   * Disconnect Pinterest account
   *
   * DELETE /api/auth/pinterest/:userId
   */
  @Delete(':userId')
  async disconnect(
    @Param('userId') userId: string,
    @Res() res: Response,
  ): Promise<void> {
    try {
      await this.oauthService.revokeToken(userId);

      this.logger.log(`Disconnected Pinterest for user: ${userId}`);

      res.status(HttpStatus.OK).json({
        success: true,
        message: 'Pinterest account disconnected successfully',
        platform: 'pinterest',
      });
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      this.logger.error(`Disconnect failed: ${errorMessage}`);

      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: 'Disconnect failed',
        message: errorMessage,
        platform: 'pinterest',
      });
    }
  }
}
