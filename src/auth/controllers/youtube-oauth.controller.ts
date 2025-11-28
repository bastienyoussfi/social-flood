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
import { YouTubeOAuthService } from '../services/youtube-oauth.service';
import { getErrorMessage } from '../../common/utils/error.utils';

/**
 * YouTube OAuth Controller
 * Handles Google OAuth 2.0 flow for YouTube
 *
 * Endpoints:
 * - GET /api/auth/youtube/login?userId=xxx - Initiate OAuth flow
 * - GET /api/auth/youtube/callback - Handle OAuth callback
 * - GET /api/auth/youtube/status?userId=xxx - Check connection status
 * - DELETE /api/auth/youtube/:userId - Disconnect user
 * - GET /api/auth/youtube/users - List all authenticated users (admin)
 */
@Controller('api/auth/youtube')
export class YouTubeOAuthController {
  private readonly logger = new Logger(YouTubeOAuthController.name);

  constructor(private readonly oauthService: YouTubeOAuthService) {}

  /**
   * Initiate YouTube OAuth flow
   * Redirects user to Google authorization page
   *
   * GET /api/auth/youtube/login?userId=xxx
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
          'YouTube OAuth is not configured. Please set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET.',
        );
      }

      this.logger.log(`Initiating OAuth flow for user: ${userId}`);

      const { url } = this.oauthService.getAuthorizationUrl(userId);

      this.logger.log('Redirecting user to Google authorization page');

      return res.redirect(url);
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      this.logger.error(`OAuth login failed: ${errorMessage}`);

      res.status(HttpStatus.BAD_REQUEST).json({
        error: 'OAuth login failed',
        message: errorMessage,
        platform: 'youtube',
      });
    }
  }

  /**
   * Handle YouTube OAuth callback
   * Called by Google after user authorizes the app
   *
   * GET /api/auth/youtube/callback?code=xxx&state=xxx
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
          platform: 'youtube',
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
        `Successfully authenticated YouTube user: ${result.platformUsername}`,
      );

      // Return JSON response
      res.status(HttpStatus.OK).json({
        success: true,
        message: 'YouTube account connected successfully',
        data: {
          userId: result.userId,
          platform: result.platform,
          platformUserId: result.platformUserId,
          platformUsername: result.platformUsername,
          scopes: result.scopes,
          expiresAt: result.expiresAt,
          channelId: (result.metadata as Record<string, string> | undefined)
            ?.channelId,
          channelTitle: (result.metadata as Record<string, string> | undefined)
            ?.channelTitle,
        },
      });
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      this.logger.error(`OAuth callback failed: ${errorMessage}`);

      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: 'OAuth callback failed',
        message: errorMessage,
        platform: 'youtube',
      });
    }
  }

  /**
   * Check OAuth connection status
   *
   * GET /api/auth/youtube/status?userId=xxx
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

      // Add channel info to response
      const connection = await this.oauthService.getConnection(userId);
      const channelId = connection?.metadata
        ? (connection.metadata as Record<string, string>).channelId
        : undefined;
      const channelTitle = connection?.metadata
        ? (connection.metadata as Record<string, string>).channelTitle
        : undefined;

      res.status(HttpStatus.OK).json({
        ...statusResponse,
        channelId,
        channelTitle,
      });
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      this.logger.error(`Status check failed: ${errorMessage}`);

      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: 'Status check failed',
        message: errorMessage,
        platform: 'youtube',
      });
    }
  }

  /**
   * List all authenticated YouTube users (admin endpoint)
   *
   * GET /api/auth/youtube/users
   */
  @Get('users')
  async listAuthenticatedUsers(@Res() res: Response): Promise<void> {
    try {
      const users = await this.oauthService.getAllConnections();

      res.status(HttpStatus.OK).json({
        count: users.length,
        platform: 'youtube',
        users: users.map((user) => ({
          userId: user.userId,
          platformUserId: user.platformUserId,
          platformUsername: user.platformUsername,
          channelId: user.metadata
            ? (user.metadata as Record<string, string>).channelId
            : undefined,
          channelTitle: user.metadata
            ? (user.metadata as Record<string, string>).channelTitle
            : undefined,
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
        platform: 'youtube',
      });
    }
  }

  /**
   * Disconnect YouTube account
   *
   * DELETE /api/auth/youtube/:userId
   */
  @Delete(':userId')
  async disconnect(
    @Param('userId') userId: string,
    @Res() res: Response,
  ): Promise<void> {
    try {
      await this.oauthService.revokeAllConnections(userId);

      this.logger.log(`Disconnected YouTube for user: ${userId}`);

      res.status(HttpStatus.OK).json({
        success: true,
        message: 'YouTube account disconnected successfully',
        platform: 'youtube',
      });
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      this.logger.error(`Disconnect failed: ${errorMessage}`);

      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: 'Disconnect failed',
        message: errorMessage,
        platform: 'youtube',
      });
    }
  }
}
