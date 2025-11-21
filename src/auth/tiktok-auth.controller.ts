import {
  Controller,
  Get,
  Query,
  Res,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import type { Response } from 'express';
import { TikTokAuthService } from './tiktok-auth.service';
import { randomBytes } from 'crypto';

/**
 * TikTok Authentication Controller
 * Handles OAuth 2.0 flow endpoints
 */
@Controller('api/auth/tiktok')
export class TikTokAuthController {
  private readonly logger = new Logger(TikTokAuthController.name);

  constructor(private readonly tiktokAuthService: TikTokAuthService) {}

  /**
   * Start OAuth flow - redirect user to TikTok authorization page
   * GET /api/auth/tiktok
   */
  @Get()
  initiateAuth(@Res() res: Response) {
    try {
      // Generate random state for CSRF protection
      const state = randomBytes(16).toString('hex');

      // In production, you should store state in session/cookie to validate later
      // For now, we'll just generate it and TikTok will send it back

      const authUrl = this.tiktokAuthService.getAuthorizationUrl(state);

      this.logger.log('Redirecting user to TikTok authorization page');

      // Redirect user to TikTok
      return res.redirect(authUrl);
    } catch (error) {
      this.logger.error('Failed to initiate auth', (error as Error).stack);
      throw new BadRequestException('Failed to initiate TikTok authentication');
    }
  }

  /**
   * OAuth callback - exchange code for token
   * GET /api/auth/tiktok/callback?code=xxx&state=xxx
   */
  @Get('callback')
  async handleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Query('error_description') errorDescription: string,
    @Res() res: Response,
  ) {
    try {
      // Check if user denied authorization
      if (error) {
        this.logger.warn(
          `TikTok authorization error: ${error} - ${errorDescription}`,
        );
        return res.send(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>TikTok Authorization Failed</title>
              <style>
                body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
                .error { background: #fee; border: 1px solid #fcc; padding: 20px; border-radius: 8px; }
                h1 { color: #c33; }
              </style>
            </head>
            <body>
              <div class="error">
                <h1>⚠️ Authorization Failed</h1>
                <p><strong>Error:</strong> ${error}</p>
                <p><strong>Description:</strong> ${errorDescription || 'User denied authorization'}</p>
                <p><a href="/api/auth/tiktok">Try again</a></p>
              </div>
            </body>
          </html>
        `);
      }

      // Check if code is present
      if (!code) {
        throw new BadRequestException('Authorization code is missing');
      }

      // Exchange code for tokens
      this.logger.log('Received authorization code, exchanging for tokens...');
      const tiktokAuth =
        await this.tiktokAuthService.exchangeCodeForToken(code);

      // Return success page with user info
      return res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>TikTok Authentication Successful</title>
            <style>
              body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
              .success { background: #efe; border: 1px solid #cfc; padding: 20px; border-radius: 8px; }
              h1 { color: #3c3; }
              .info { background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 15px 0; }
              .info p { margin: 8px 0; }
              .code { background: #333; color: #0f0; padding: 10px; border-radius: 5px; font-family: monospace; overflow-x: auto; }
              .label { font-weight: bold; }
            </style>
          </head>
          <body>
            <div class="success">
              <h1>✅ TikTok Authentication Successful!</h1>

              <div class="info">
                <p><span class="label">TikTok Username:</span> ${tiktokAuth.tiktokUsername || 'N/A'}</p>
                <p><span class="label">TikTok User ID:</span> ${tiktokAuth.tiktokUserId}</p>
                <p><span class="label">Token Expires:</span> ${tiktokAuth.expiresAt.toLocaleString()}</p>
                <p><span class="label">Scopes:</span> ${tiktokAuth.scopes?.join(', ') || 'N/A'}</p>
              </div>

              <h2>📝 Your TikTok User ID</h2>
              <p>Use this ID when posting to TikTok:</p>
              <div class="code">${tiktokAuth.tiktokUserId}</div>

              <h2>🚀 Next Steps</h2>
              <ol>
                <li>Copy your TikTok User ID above</li>
                <li>Include it in your API requests when posting to TikTok</li>
                <li>Your access token will be automatically refreshed when needed</li>
              </ol>

              <h3>Example API Request:</h3>
              <pre class="code">
POST /api/posts/multi-platform
Content-Type: application/json

{
  "text": "Check out my video!",
  "media": [{
    "url": "https://example.com/video.mp4",
    "type": "video"
  }],
  "platforms": ["tiktok"],
  "tiktokUserId": "${tiktokAuth.tiktokUserId}"
}
              </pre>

              <p style="margin-top: 30px;">
                <a href="/api/auth/tiktok/users">View all authenticated users</a>
              </p>
            </div>
          </body>
        </html>
      `);
    } catch (error) {
      this.logger.error(
        'Failed to handle OAuth callback',
        (error as Error).stack,
      );
      return res.status(500).send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>TikTok Authentication Error</title>
            <style>
              body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
              .error { background: #fee; border: 1px solid #fcc; padding: 20px; border-radius: 8px; }
              h1 { color: #c33; }
            </style>
          </head>
          <body>
            <div class="error">
              <h1>⚠️ Authentication Error</h1>
              <p>${(error as Error).message}</p>
              <p><a href="/api/auth/tiktok">Try again</a></p>
            </div>
          </body>
        </html>
      `);
    }
  }

  /**
   * List all authenticated TikTok users
   * GET /api/auth/tiktok/users
   */
  @Get('users')
  async listAuthenticatedUsers() {
    const users = await this.tiktokAuthService.getAllAuthenticatedUsers();

    return {
      count: users.length,
      users: users.map((user) => ({
        tiktokUserId: user.tiktokUserId,
        tiktokUsername: user.tiktokUsername,
        scopes: user.scopes,
        expiresAt: user.expiresAt,
        createdAt: user.createdAt,
        isExpired: user.isAccessTokenExpired(),
      })),
    };
  }

  /**
   * Test endpoint to check if a user's token is valid
   * GET /api/auth/tiktok/check/:userId
   */
  @Get('check/:userId')
  async checkUserToken(@Query('userId') userId: string) {
    try {
      const auth = await this.tiktokAuthService.getAuthByUserId(userId);

      if (!auth) {
        return {
          authenticated: false,
          message: 'User not found. Please authenticate first.',
        };
      }

      return {
        authenticated: true,
        tiktokUsername: auth.tiktokUsername,
        expiresAt: auth.expiresAt,
        isExpired: auth.isAccessTokenExpired(),
        needsRefresh: auth.isAccessTokenExpired(),
      };
    } catch (error) {
      this.logger.error('Failed to check user token', (error as Error).stack);
      throw new BadRequestException('Failed to check authentication status');
    }
  }
}
