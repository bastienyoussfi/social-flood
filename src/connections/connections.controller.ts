import {
  Controller,
  Get,
  Delete,
  Post,
  Param,
  Query,
  Res,
  UseGuards,
  Logger,
  BadRequestException,
  NotFoundException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard, CurrentUser } from '../better-auth';
import type { User } from '../lib/auth';
import { ConnectionsService } from './connections.service';
import { getErrorMessage } from '../common/utils/error.utils';

/**
 * Supported social platforms for posting
 */
type SocialPlatform =
  | 'linkedin'
  | 'twitter'
  | 'tiktok'
  | 'pinterest'
  | 'instagram'
  | 'youtube';

/**
 * Social Connections Controller
 * Manages user connections to social media platforms
 *
 * All endpoints require authentication via better-auth.
 *
 * Endpoints:
 * - GET /api/connections - List all connections for authenticated user
 * - GET /api/connections/:platform/connect - Initiate OAuth flow for a platform
 * - GET /api/connections/:platform/callback - Handle OAuth callback
 * - DELETE /api/connections/:id - Disconnect a specific connection
 * - POST /api/connections/:id/refresh - Force refresh tokens for a connection
 */
@Controller('api/connections')
export class ConnectionsController {
  private readonly logger = new Logger(ConnectionsController.name);

  constructor(private readonly connectionsService: ConnectionsService) {}

  /**
   * List all social connections for the authenticated user
   *
   * GET /api/connections
   */
  @Get()
  @UseGuards(AuthGuard)
  async listConnections(@CurrentUser() user: User, @Res() res: Response) {
    try {
      const connections = await this.connectionsService.getConnectionsForUser(
        user.id,
      );

      res.status(HttpStatus.OK).json({
        count: connections.length,
        connections: connections.map((conn) => ({
          id: conn.id,
          platform: conn.platform,
          displayName: conn.displayName,
          platformUserId: conn.platformUserId,
          platformUsername: conn.platformUsername,
          isActive: conn.isActive,
          expiresAt: conn.expiresAt,
          isExpired: conn.isExpired(),
          needsRefresh: conn.needsRefresh(),
          createdAt: conn.createdAt,
        })),
      });
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      this.logger.error(`Failed to list connections: ${errorMessage}`);

      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: 'Failed to list connections',
        message: errorMessage,
      });
    }
  }

  /**
   * Initiate OAuth flow to connect a social platform
   *
   * GET /api/connections/:platform/connect
   */
  @Get(':platform/connect')
  @UseGuards(AuthGuard)
  connectPlatform(
    @Param('platform') platform: SocialPlatform,
    @CurrentUser() user: User,
    @Res() res: Response,
  ) {
    try {
      this.validatePlatform(platform);

      this.logger.log(`User ${user.id} initiating ${platform} connection flow`);

      const { url } = this.connectionsService.initiateConnection(
        user.id,
        platform,
      );

      return res.redirect(url);
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      this.logger.error(
        `Failed to initiate ${platform} connection: ${errorMessage}`,
      );

      res.status(HttpStatus.BAD_REQUEST).json({
        error: 'Failed to initiate connection',
        message: errorMessage,
        platform,
      });
    }
  }

  /**
   * Handle OAuth callback for a platform
   * Note: This is an unauthenticated endpoint as OAuth callbacks don't carry session
   *
   * GET /api/connections/:platform/callback
   */
  @Get(':platform/callback')
  async handleCallback(
    @Param('platform') platform: SocialPlatform,
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Query('error_description') errorDescription: string,
    @Res() res: Response,
  ) {
    try {
      // Check for OAuth errors
      if (error) {
        this.logger.error(`OAuth error: ${error} - ${errorDescription}`);
        res.status(HttpStatus.BAD_REQUEST).json({
          error: 'OAuth authorization failed',
          message: errorDescription || error,
          platform,
        });
        return;
      }

      if (!code) {
        throw new BadRequestException('Authorization code is missing');
      }

      if (!state) {
        throw new BadRequestException('State parameter is missing');
      }

      this.logger.log(`Processing OAuth callback for ${platform}...`);

      const result = await this.connectionsService.handleCallback(
        platform,
        code,
        state,
      );

      this.logger.log(
        `Successfully connected ${platform} for user ${result.userId}`,
      );

      // Return JSON response (frontend can redirect after receiving this)
      res.status(HttpStatus.OK).json({
        success: true,
        message: `${platform} account connected successfully`,
        data: {
          userId: result.userId,
          platform: result.platform,
          platformUserId: result.platformUserId,
          platformUsername: result.platformUsername,
          expiresAt: result.expiresAt,
        },
      });
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      this.logger.error(`OAuth callback failed: ${errorMessage}`);

      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: 'OAuth callback failed',
        message: errorMessage,
        platform,
      });
    }
  }

  /**
   * Disconnect a social connection
   *
   * DELETE /api/connections/:id
   */
  @Delete(':id')
  @UseGuards(AuthGuard)
  async disconnectConnection(
    @Param('id') connectionId: string,
    @CurrentUser() user: User,
    @Res() res: Response,
  ) {
    try {
      // Verify the connection belongs to the user
      const connection =
        await this.connectionsService.getConnectionById(connectionId);

      if (!connection) {
        throw new NotFoundException('Connection not found');
      }

      if (connection.userId !== user.id) {
        throw new BadRequestException(
          'You do not have permission to disconnect this connection',
        );
      }

      await this.connectionsService.revokeConnection(connectionId);

      this.logger.log(
        `User ${user.id} disconnected ${connection.platform} connection ${connectionId}`,
      );

      res.status(HttpStatus.OK).json({
        success: true,
        message: 'Connection disconnected successfully',
        platform: connection.platform,
      });
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      this.logger.error(`Failed to disconnect connection: ${errorMessage}`);

      if (error instanceof NotFoundException) {
        res.status(HttpStatus.NOT_FOUND).json({
          error: 'Not found',
          message: errorMessage,
        });
      } else if (error instanceof BadRequestException) {
        res.status(HttpStatus.BAD_REQUEST).json({
          error: 'Bad request',
          message: errorMessage,
        });
      } else {
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
          error: 'Failed to disconnect connection',
          message: errorMessage,
        });
      }
    }
  }

  /**
   * Force refresh tokens for a connection
   *
   * POST /api/connections/:id/refresh
   */
  @Post(':id/refresh')
  @UseGuards(AuthGuard)
  async refreshConnection(
    @Param('id') connectionId: string,
    @CurrentUser() user: User,
    @Res() res: Response,
  ) {
    try {
      // Verify the connection belongs to the user
      const connection =
        await this.connectionsService.getConnectionById(connectionId);

      if (!connection) {
        throw new NotFoundException('Connection not found');
      }

      if (connection.userId !== user.id) {
        throw new BadRequestException(
          'You do not have permission to refresh this connection',
        );
      }

      const refreshedConnection =
        await this.connectionsService.refreshConnection(connectionId);

      this.logger.log(
        `User ${user.id} refreshed ${connection.platform} connection ${connectionId}`,
      );

      res.status(HttpStatus.OK).json({
        success: true,
        message: 'Connection refreshed successfully',
        data: {
          id: refreshedConnection.id,
          platform: refreshedConnection.platform,
          expiresAt: refreshedConnection.expiresAt,
          isExpired: refreshedConnection.isExpired(),
        },
      });
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      this.logger.error(`Failed to refresh connection: ${errorMessage}`);

      if (error instanceof NotFoundException) {
        res.status(HttpStatus.NOT_FOUND).json({
          error: 'Not found',
          message: errorMessage,
        });
      } else if (error instanceof BadRequestException) {
        res.status(HttpStatus.BAD_REQUEST).json({
          error: 'Bad request',
          message: errorMessage,
        });
      } else {
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
          error: 'Failed to refresh connection',
          message: errorMessage,
        });
      }
    }
  }

  /**
   * Get details of a specific connection
   *
   * GET /api/connections/:id
   */
  @Get('details/:id')
  @UseGuards(AuthGuard)
  async getConnectionDetails(
    @Param('id') connectionId: string,
    @CurrentUser() user: User,
    @Res() res: Response,
  ) {
    try {
      const connection =
        await this.connectionsService.getConnectionById(connectionId);

      if (!connection) {
        throw new NotFoundException('Connection not found');
      }

      if (connection.userId !== user.id) {
        throw new BadRequestException(
          'You do not have permission to view this connection',
        );
      }

      res.status(HttpStatus.OK).json({
        id: connection.id,
        platform: connection.platform,
        displayName: connection.displayName,
        platformUserId: connection.platformUserId,
        platformUsername: connection.platformUsername,
        scopes: connection.scopes,
        isActive: connection.isActive,
        expiresAt: connection.expiresAt,
        isExpired: connection.isExpired(),
        needsRefresh: connection.needsRefresh(),
        createdAt: connection.createdAt,
        updatedAt: connection.updatedAt,
        metadata: connection.metadata,
      });
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      this.logger.error(`Failed to get connection details: ${errorMessage}`);

      if (error instanceof NotFoundException) {
        res.status(HttpStatus.NOT_FOUND).json({
          error: 'Not found',
          message: errorMessage,
        });
      } else if (error instanceof BadRequestException) {
        res.status(HttpStatus.BAD_REQUEST).json({
          error: 'Bad request',
          message: errorMessage,
        });
      } else {
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
          error: 'Failed to get connection details',
          message: errorMessage,
        });
      }
    }
  }

  /**
   * Validate that the platform is supported
   */
  private validatePlatform(
    platform: string,
  ): asserts platform is SocialPlatform {
    const supportedPlatforms: SocialPlatform[] = [
      'linkedin',
      'twitter',
      'tiktok',
      'pinterest',
      'instagram',
      'youtube',
    ];

    if (!supportedPlatforms.includes(platform as SocialPlatform)) {
      throw new BadRequestException(
        `Unsupported platform: ${platform}. Supported platforms: ${supportedPlatforms.join(', ')}`,
      );
    }
  }
}
