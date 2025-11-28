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
import { InstagramOAuthService } from '../services/instagram-oauth.service';
import { getErrorMessage } from '../../common/utils/error.utils';

/**
 * Instagram OAuth Controller
 * Handles OAuth 2.0 flow endpoints via Facebook/Meta Graph API
 *
 * Endpoints:
 * - GET /api/auth/instagram/login?userId=xxx - Initiate OAuth flow
 * - GET /api/auth/instagram/callback - Handle OAuth callback
 * - GET /api/auth/instagram/status?userId=xxx - Check connection status
 * - DELETE /api/auth/instagram/:userId - Disconnect user
 * - GET /api/auth/instagram/users - List all authenticated users (admin)
 */
@Controller('api/auth/instagram')
export class InstagramOAuthController {
  private readonly logger = new Logger(InstagramOAuthController.name);

  constructor(private readonly oauthService: InstagramOAuthService) {}

  /**
   * Initiate Instagram OAuth flow
   * Redirects user to Facebook authorization page
   *
   * GET /api/auth/instagram/login?userId=xxx
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
          'Instagram OAuth is not configured. Please set META_APP_ID and META_APP_SECRET.',
        );
      }

      this.logger.log(`Initiating OAuth flow for user: ${userId}`);

      const { url } = this.oauthService.getAuthorizationUrl(userId);

      this.logger.log('Redirecting user to Facebook authorization page');

      return res.redirect(url);
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      this.logger.error(`OAuth login failed: ${errorMessage}`);

      res.status(HttpStatus.BAD_REQUEST).json({
        error: 'OAuth login failed',
        message: errorMessage,
        platform: 'instagram',
      });
    }
  }

  /**
   * Handle Instagram OAuth callback
   * Called by Facebook after user authorizes the app
   *
   * GET /api/auth/instagram/callback?code=xxx&state=xxx
   */
  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Query('error_description') errorDescription: string,
    @Query('error_reason') errorReason: string,
    @Res() res: Response,
  ): Promise<void> {
    try {
      // Check for OAuth errors
      if (error) {
        this.logger.error(
          `OAuth error: ${error} - ${errorDescription} (${errorReason})`,
        );
        res.status(HttpStatus.BAD_REQUEST).json({
          error: 'OAuth authorization failed',
          message: errorDescription || error,
          reason: errorReason,
          platform: 'instagram',
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
        `Successfully authenticated Instagram user: ${result.platformUsername}`,
      );

      // Return JSON response
      res.status(HttpStatus.OK).json({
        success: true,
        message: 'Instagram account connected successfully',
        data: {
          userId: result.userId,
          platform: result.platform,
          platformUserId: result.platformUserId,
          platformUsername: result.platformUsername,
          scopes: result.scopes,
          expiresAt: result.expiresAt,
          igUserId: (result.metadata as Record<string, string> | undefined)
            ?.igUserId,
          pageName: (result.metadata as Record<string, string> | undefined)
            ?.pageName,
        },
      });
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      this.logger.error(`OAuth callback failed: ${errorMessage}`);

      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: 'OAuth callback failed',
        message: errorMessage,
        platform: 'instagram',
      });
    }
  }

  /**
   * Check OAuth connection status
   *
   * GET /api/auth/instagram/status?userId=xxx
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

      // Add Instagram-specific info to response
      const token = await this.oauthService.getToken(userId);
      const metadata = token?.metadata as Record<string, string> | undefined;

      res.status(HttpStatus.OK).json({
        ...statusResponse,
        igUserId: metadata?.igUserId,
        username: metadata?.username,
        pageName: metadata?.pageName,
      });
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      this.logger.error(`Status check failed: ${errorMessage}`);

      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: 'Status check failed',
        message: errorMessage,
        platform: 'instagram',
      });
    }
  }

  /**
   * List all authenticated Instagram users (admin endpoint)
   *
   * GET /api/auth/instagram/users
   */
  @Get('users')
  async listAuthenticatedUsers(@Res() res: Response): Promise<void> {
    try {
      const users = await this.oauthService.getAllAuthenticatedUsers();

      res.status(HttpStatus.OK).json({
        count: users.length,
        platform: 'instagram',
        users: users.map((user) => {
          const metadata = user.metadata as Record<string, string> | undefined;
          return {
            userId: user.userId,
            platformUserId: user.platformUserId,
            platformUsername: user.platformUsername,
            igUserId: metadata?.igUserId,
            username: metadata?.username,
            pageName: metadata?.pageName,
            scopes: user.scopes,
            expiresAt: user.expiresAt,
            createdAt: user.createdAt,
            isExpired: user.isExpired(),
            needsRefresh: user.needsRefresh(),
          };
        }),
      });
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      this.logger.error(`Failed to list users: ${errorMessage}`);

      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: 'Failed to list users',
        message: errorMessage,
        platform: 'instagram',
      });
    }
  }

  /**
   * Disconnect Instagram account
   *
   * DELETE /api/auth/instagram/:userId
   */
  @Delete(':userId')
  async disconnect(
    @Param('userId') userId: string,
    @Res() res: Response,
  ): Promise<void> {
    try {
      await this.oauthService.revokeToken(userId);

      this.logger.log(`Disconnected Instagram for user: ${userId}`);

      res.status(HttpStatus.OK).json({
        success: true,
        message: 'Instagram account disconnected successfully',
        platform: 'instagram',
      });
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      this.logger.error(`Disconnect failed: ${errorMessage}`);

      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: 'Disconnect failed',
        message: errorMessage,
        platform: 'instagram',
      });
    }
  }
}
