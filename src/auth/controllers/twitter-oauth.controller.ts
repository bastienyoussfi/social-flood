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
import { TwitterOAuthService } from '../services/twitter-oauth.service';
import { getErrorMessage } from '../../common/utils/error.utils';

/**
 * Twitter OAuth Controller
 * Handles OAuth 2.0 with PKCE flow endpoints
 *
 * Endpoints:
 * - GET /api/auth/twitter/login?userId=xxx - Initiate OAuth flow
 * - GET /api/auth/twitter/callback - Handle OAuth callback
 * - GET /api/auth/twitter/status?userId=xxx - Check connection status
 * - DELETE /api/auth/twitter/:userId - Disconnect user
 * - GET /api/auth/twitter/users - List all authenticated users (admin)
 */
@Controller('api/auth/twitter')
export class TwitterOAuthController {
  private readonly logger = new Logger(TwitterOAuthController.name);

  constructor(private readonly oauthService: TwitterOAuthService) {}

  /**
   * Initiate Twitter OAuth flow
   * Redirects user to Twitter authorization page
   *
   * GET /api/auth/twitter/login?userId=xxx
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
          'Twitter OAuth 2.0 is not configured. Please set TWITTER_CLIENT_ID and TWITTER_CLIENT_SECRET.',
        );
      }

      this.logger.log(`Initiating OAuth flow for user: ${userId}`);

      const { url } = this.oauthService.getAuthorizationUrl(userId);

      this.logger.log('Redirecting user to Twitter authorization page');

      return res.redirect(url);
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      this.logger.error(`OAuth login failed: ${errorMessage}`);

      res.status(HttpStatus.BAD_REQUEST).json({
        error: 'OAuth login failed',
        message: errorMessage,
        platform: 'twitter',
      });
    }
  }

  /**
   * Handle Twitter OAuth callback
   * Called by Twitter after user authorizes the app
   *
   * GET /api/auth/twitter/callback?code=xxx&state=xxx
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
          platform: 'twitter',
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
        `Successfully authenticated Twitter user: @${result.platformUsername}`,
      );

      // Return JSON response
      res.status(HttpStatus.OK).json({
        success: true,
        message: 'Twitter account connected successfully',
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
        platform: 'twitter',
      });
    }
  }

  /**
   * Check OAuth connection status
   *
   * GET /api/auth/twitter/status?userId=xxx
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
        platform: 'twitter',
      });
    }
  }

  /**
   * List all authenticated Twitter users (admin endpoint)
   *
   * GET /api/auth/twitter/users
   */
  @Get('users')
  async listAuthenticatedUsers(@Res() res: Response): Promise<void> {
    try {
      const users = await this.oauthService.getAllAuthenticatedUsers();

      res.status(HttpStatus.OK).json({
        count: users.length,
        platform: 'twitter',
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
        platform: 'twitter',
      });
    }
  }

  /**
   * Disconnect Twitter account
   *
   * DELETE /api/auth/twitter/:userId
   */
  @Delete(':userId')
  async disconnect(
    @Param('userId') userId: string,
    @Res() res: Response,
  ): Promise<void> {
    try {
      await this.oauthService.revokeToken(userId);

      this.logger.log(`Disconnected Twitter for user: ${userId}`);

      res.status(HttpStatus.OK).json({
        success: true,
        message: 'Twitter account disconnected successfully',
        platform: 'twitter',
      });
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      this.logger.error(`Disconnect failed: ${errorMessage}`);

      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: 'Disconnect failed',
        message: errorMessage,
        platform: 'twitter',
      });
    }
  }
}
