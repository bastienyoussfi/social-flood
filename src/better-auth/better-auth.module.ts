import { Module } from '@nestjs/common';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import { auth } from '../lib/auth';

/**
 * BetterAuth Module
 * Integrates better-auth with NestJS for user authentication
 *
 * This handles:
 * - Email/password signup and login
 * - Google OAuth login
 * - GitHub OAuth login
 * - Session management
 *
 * All auth routes are exposed at /api/auth/*
 */
@Module({
  imports: [
    AuthModule.forRoot({
      auth,
      // Mount at /api/auth to match our API structure
      basePath: '/api/auth',
    }),
  ],
  exports: [AuthModule],
})
export class BetterAuthModule {}
