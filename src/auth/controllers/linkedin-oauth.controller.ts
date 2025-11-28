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
import { LinkedInOAuthService } from '../services/linkedin-oauth.service';
import { getErrorMessage } from '../../common/utils/error.utils';

/**
 * LinkedIn OAuth Controller
 * Handles OAuth 2.0 flow endpoints
 *
 * Endpoints:
 * - GET /api/auth/linkedin/login?userId=xxx - Initiate OAuth flow
 * - GET /api/auth/linkedin/callback - Handle OAuth callback
 * - GET /api/auth/linkedin/status?userId=xxx - Check connection status
 * - DELETE /api/auth/linkedin/:userId - Disconnect user
 * - GET /api/auth/linkedin/users - List all authenticated users (admin)
 */
@Controller('api/auth/linkedin')
export class LinkedInOAuthController {
  private readonly logger = new Logger(LinkedInOAuthController.name);

  constructor(private readonly oauthService: LinkedInOAuthService) {}

  /**
   * Initiate LinkedIn OAuth flow
   * Redirects user to LinkedIn authorization page
   *
   * GET /api/auth/linkedin/login?userId=xxx
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
          'LinkedIn OAuth is not configured. Please set LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET.',
        );
      }

      this.logger.log(`Initiating OAuth flow for user: ${userId}`);

      const { url } = this.oauthService.getAuthorizationUrl(userId);

      this.logger.log('Redirecting user to LinkedIn authorization page');

      return res.redirect(url);
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      this.logger.error(`OAuth login failed: ${errorMessage}`);

      res.status(HttpStatus.BAD_REQUEST).json({
        error: 'OAuth login failed',
        message: errorMessage,
        platform: 'linkedin',
      });
    }
  }

  /**
   * Handle LinkedIn OAuth callback
   * Called by LinkedIn after user authorizes the app
   *
   * GET /api/auth/linkedin/callback?code=xxx&state=xxx
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
          platform: 'linkedin',
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
        `Successfully authenticated LinkedIn user: ${result.platformUsername}`,
      );

      // Return JSON response
      res.status(HttpStatus.OK).json({
        success: true,
        message: 'LinkedIn account connected successfully',
        data: {
          userId: result.userId,
          platform: result.platform,
          platformUserId: result.platformUserId,
          platformUsername: result.platformUsername,
          scopes: result.scopes,
          expiresAt: result.expiresAt,
          personUrn: (result.metadata as Record<string, string> | undefined)
            ?.personUrn,
        },
      });
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      this.logger.error(`OAuth callback failed: ${errorMessage}`);

      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: 'OAuth callback failed',
        message: errorMessage,
        platform: 'linkedin',
      });
    }
  }

  /**
   * Check OAuth connection status
   *
   * GET /api/auth/linkedin/status?userId=xxx
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

      // Add person URN to response
      const token = await this.oauthService.getToken(userId);
      const personUrn = token?.metadata
        ? (token.metadata as Record<string, string>).personUrn
        : undefined;

      res.status(HttpStatus.OK).json({
        ...statusResponse,
        personUrn,
      });
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      this.logger.error(`Status check failed: ${errorMessage}`);

      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: 'Status check failed',
        message: errorMessage,
        platform: 'linkedin',
      });
    }
  }

  /**
   * List all authenticated LinkedIn users (admin endpoint)
   *
   * GET /api/auth/linkedin/users
   */
  @Get('users')
  async listAuthenticatedUsers(@Res() res: Response): Promise<void> {
    try {
      const users = await this.oauthService.getAllAuthenticatedUsers();

      res.status(HttpStatus.OK).json({
        count: users.length,
        platform: 'linkedin',
        users: users.map((user) => ({
          userId: user.userId,
          platformUserId: user.platformUserId,
          platformUsername: user.platformUsername,
          personUrn: user.metadata
            ? (user.metadata as Record<string, string>).personUrn
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
        platform: 'linkedin',
      });
    }
  }

  /**
   * Disconnect LinkedIn account
   *
   * DELETE /api/auth/linkedin/:userId
   */
  @Delete(':userId')
  async disconnect(
    @Param('userId') userId: string,
    @Res() res: Response,
  ): Promise<void> {
    try {
      await this.oauthService.revokeToken(userId);

      this.logger.log(`Disconnected LinkedIn for user: ${userId}`);

      res.status(HttpStatus.OK).json({
        success: true,
        message: 'LinkedIn account disconnected successfully',
        platform: 'linkedin',
      });
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      this.logger.error(`Disconnect failed: ${errorMessage}`);

      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: 'Disconnect failed',
        message: errorMessage,
        platform: 'linkedin',
      });
    }
  }
}
