import { betterAuth } from 'better-auth';
import { Pool } from 'pg';

/**
 * Better Auth Configuration
 * Handles user authentication (email/password, Google, GitHub)
 *
 * Note: This is separate from social platform OAuth (LinkedIn, Twitter, etc.)
 * which is handled by our custom SocialConnection system.
 */

// Create PostgreSQL pool for better-auth
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USERNAME || 'poster',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'social_poster',
});

export const auth = betterAuth({
  // Database configuration
  database: pool,

  // Base URL for OAuth callbacks
  baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:3000',

  // Secret for signing tokens
  secret: process.env.BETTER_AUTH_SECRET,

  // Email and password authentication
  emailAndPassword: {
    enabled: true,
    // Require email verification (optional, can be enabled later)
    requireEmailVerification: false,
  },

  // Social login providers (for app authentication, not social posting)
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    },
    github: {
      clientId: process.env.GITHUB_CLIENT_ID || '',
      clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
    },
  },

  // Session configuration
  session: {
    // Session expiration time (7 days)
    expiresIn: 60 * 60 * 24 * 7,
    // Update session expiration on each request
    updateAge: 60 * 60 * 24, // 1 day
    // Cookie settings
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5 minutes
    },
  },

  // Advanced configuration
  advanced: {
    // Use secure cookies
    useSecureCookies: process.env.NODE_ENV === 'production',
  },

  // Trusted origins for CORS
  trustedOrigins: [
    process.env.FRONTEND_URL || 'http://localhost:5173',
    'http://localhost:3000',
  ],
});

// Export auth types for use in NestJS
export type Auth = typeof auth;
export type Session = typeof auth.$Infer.Session;
export type User = typeof auth.$Infer.Session.user;
