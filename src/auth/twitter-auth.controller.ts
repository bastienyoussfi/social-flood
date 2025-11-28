import {
  Controller,
  Get,
  Query,
  Res,
  Logger,
  BadRequestException,
  Delete,
  Param,
} from '@nestjs/common';
import type { Response } from 'express';
import { TwitterAuthService } from './twitter-auth.service';

/**
 * Twitter Authentication Controller
 * Handles OAuth 2.0 with PKCE flow endpoints
 */
@Controller('api/auth/twitter')
export class TwitterAuthController {
  private readonly logger = new Logger(TwitterAuthController.name);

  constructor(private readonly twitterAuthService: TwitterAuthService) {}

  /**
   * Start OAuth flow - redirect user to Twitter authorization page
   * GET /api/auth/twitter
   */
  @Get()
  initiateAuth(@Res() res: Response) {
    try {
      if (!this.twitterAuthService.isConfigured()) {
        throw new BadRequestException(
          'Twitter OAuth 2.0 is not configured. Please set TWITTER_CLIENT_ID and TWITTER_CLIENT_SECRET.',
        );
      }

      const { url } = this.twitterAuthService.getAuthorizationUrl();

      this.logger.log('Redirecting user to Twitter authorization page');

      // Redirect user to Twitter
      return res.redirect(url);
    } catch (error) {
      this.logger.error('Failed to initiate auth', (error as Error).stack);
      throw new BadRequestException(
        'Failed to initiate Twitter authentication',
      );
    }
  }

  /**
   * OAuth callback - exchange code for token
   * GET /api/auth/twitter/callback?code=xxx&state=xxx
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
          `Twitter authorization error: ${error} - ${errorDescription}`,
        );
        return res.send(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Twitter Authorization Failed</title>
              <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; background: #15202b; color: #fff; }
                .error { background: #1c2938; border: 1px solid #38444d; padding: 20px; border-radius: 16px; }
                h1 { color: #f4212e; }
                a { color: #1d9bf0; text-decoration: none; }
                a:hover { text-decoration: underline; }
              </style>
            </head>
            <body>
              <div class="error">
                <h1>Authorization Failed</h1>
                <p><strong>Error:</strong> ${error}</p>
                <p><strong>Description:</strong> ${errorDescription || 'User denied authorization'}</p>
                <p><a href="/api/auth/twitter">Try again</a></p>
              </div>
            </body>
          </html>
        `);
      }

      // Check if code is present
      if (!code) {
        throw new BadRequestException('Authorization code is missing');
      }

      if (!state) {
        throw new BadRequestException('State parameter is missing');
      }

      // Exchange code for tokens
      this.logger.log('Received authorization code, exchanging for tokens...');
      const oauthToken = await this.twitterAuthService.exchangeCodeForToken(
        code,
        state,
      );

      // Return success page with user info
      return res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Twitter Authentication Successful</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; background: #15202b; color: #fff; }
              .success { background: #1c2938; border: 1px solid #38444d; padding: 20px; border-radius: 16px; }
              h1 { color: #1d9bf0; }
              h2 { color: #8899a6; font-size: 1.1em; margin-top: 24px; }
              .info { background: #192734; padding: 15px; border-radius: 12px; margin: 15px 0; }
              .info p { margin: 8px 0; }
              .code { background: #000; color: #1d9bf0; padding: 12px; border-radius: 8px; font-family: 'SF Mono', monospace; overflow-x: auto; font-size: 14px; }
              .label { color: #8899a6; }
              pre.code { white-space: pre-wrap; word-break: break-all; }
              a { color: #1d9bf0; text-decoration: none; }
              a:hover { text-decoration: underline; }
              ol { color: #8899a6; }
              ol li { margin: 8px 0; }
            </style>
          </head>
          <body>
            <div class="success">
              <h1>✓ Twitter Authentication Successful!</h1>

              <div class="info">
                <p><span class="label">Twitter Username:</span> @${oauthToken.platformUsername || 'N/A'}</p>
                <p><span class="label">Twitter User ID:</span> ${oauthToken.platformUserId}</p>
                <p><span class="label">Token Expires:</span> ${oauthToken.expiresAt?.toLocaleString() || 'N/A'}</p>
                <p><span class="label">Scopes:</span> ${oauthToken.scopes?.join(', ') || 'N/A'}</p>
              </div>

              <h2>Your Twitter User ID</h2>
              <p>Use this ID when posting to Twitter on behalf of this user:</p>
              <div class="code">${oauthToken.platformUserId}</div>

              <h2>Next Steps</h2>
              <ol>
                <li>Copy your Twitter User ID above</li>
                <li>Include it as <code>twitterUserId</code> in your API requests</li>
                <li>Your access token will be automatically refreshed when needed</li>
              </ol>

              <h2>Example API Request</h2>
              <pre class="code">
POST /api/posts/multi-platform
Content-Type: application/json

{
  "text": "Hello from my app!",
  "platforms": ["twitter"],
  "twitterUserId": "${oauthToken.platformUserId}"
}
              </pre>

              <p style="margin-top: 30px;">
                <a href="/api/auth/twitter/users">View all authenticated users</a>
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
            <title>Twitter Authentication Error</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; background: #15202b; color: #fff; }
              .error { background: #1c2938; border: 1px solid #38444d; padding: 20px; border-radius: 16px; }
              h1 { color: #f4212e; }
              a { color: #1d9bf0; text-decoration: none; }
              a:hover { text-decoration: underline; }
            </style>
          </head>
          <body>
            <div class="error">
              <h1>Authentication Error</h1>
              <p>${(error as Error).message}</p>
              <p><a href="/api/auth/twitter">Try again</a></p>
            </div>
          </body>
        </html>
      `);
    }
  }

  /**
   * List all authenticated Twitter users
   * GET /api/auth/twitter/users
   */
  @Get('users')
  async listAuthenticatedUsers() {
    const users = await this.twitterAuthService.getAllAuthenticatedUsers();

    return {
      count: users.length,
      users: users.map((user) => ({
        twitterUserId: user.platformUserId,
        twitterUsername: user.platformUsername,
        scopes: user.scopes,
        expiresAt: user.expiresAt,
        createdAt: user.createdAt,
        isExpired: user.isExpired(),
        needsRefresh: user.needsRefresh(),
      })),
    };
  }

  /**
   * Check if a user's token is valid
   * GET /api/auth/twitter/check/:userId
   */
  @Get('check/:userId')
  async checkUserToken(@Param('userId') userId: string) {
    try {
      const auth = await this.twitterAuthService.getAuthByUserId(userId);

      if (!auth) {
        return {
          authenticated: false,
          message: 'User not found. Please authenticate first.',
        };
      }

      return {
        authenticated: true,
        twitterUsername: auth.platformUsername,
        expiresAt: auth.expiresAt,
        isExpired: auth.isExpired(),
        needsRefresh: auth.needsRefresh(),
        isActive: auth.isActive,
      };
    } catch (error) {
      this.logger.error('Failed to check user token', (error as Error).stack);
      throw new BadRequestException('Failed to check authentication status');
    }
  }

  /**
   * Revoke/deactivate a user's authentication
   * DELETE /api/auth/twitter/:userId
   */
  @Delete(':userId')
  async revokeAuth(@Param('userId') userId: string) {
    try {
      await this.twitterAuthService.deleteAuth(userId);
      return {
        success: true,
        message: `Twitter authentication revoked for user: ${userId}`,
      };
    } catch (error) {
      this.logger.error('Failed to revoke auth', (error as Error).stack);
      throw new BadRequestException('Failed to revoke authentication');
    }
  }
}
