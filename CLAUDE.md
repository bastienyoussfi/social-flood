# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Social Flood is a NestJS application for posting content simultaneously to multiple social media platforms (LinkedIn, Twitter, Bluesky, TikTok, Pinterest, Instagram). It uses a queue-based architecture with Bull/Redis for reliable asynchronous job processing and PostgreSQL for persistence.

## Development Commands

**Package Manager**: This project uses `pnpm`. The CI workflow uses pnpm, so always use `pnpm` instead of `npm`.

### Essential Commands
```bash
# Install dependencies
pnpm install

# Development server (auto-reload)
pnpm run start:dev

# Build for production
pnpm run build

# Run production build
pnpm run start:prod

# Tests
pnpm test                 # Run all unit tests
pnpm run test:watch       # Watch mode
pnpm run test:cov         # With coverage
pnpm run test:e2e         # E2E tests

# Code quality
pnpm run lint             # Lint and auto-fix
pnpm run lint:check       # Lint without fixing
pnpm run format           # Format code
pnpm run format:check     # Check formatting (used in CI)
```

### Docker Development
```bash
# Start entire stack (PostgreSQL + Redis + App)
docker-compose up -d

# Start only database services (for local dev)
docker-compose up -d postgres redis

# View logs
docker-compose logs -f app

# Stop everything
docker-compose down

# Stop and remove volumes
docker-compose down -v
```

## Architecture

### Authentication System (Two-Layer)

The application uses a two-layer authentication approach:

1. **User Authentication (better-auth)** - `src/better-auth/`
   - Email/password signup and login
   - Google OAuth login
   - GitHub OAuth login
   - Session management
   - Configured in `src/lib/auth.ts`

2. **Social Platform Connections** - `src/auth/` and `src/connections/`
   - OAuth flows for social platforms (LinkedIn, Twitter, TikTok, etc.)
   - Multiple accounts per platform per user
   - Stored in `social_connections` table
   - Managed via `ConnectionsService`

### Platform Adapter Pattern

Each social media platform follows a consistent module structure:

```
src/platforms/{platform}/
├── {platform}.adapter.ts     # Implements PlatformAdapter interface
├── {platform}.service.ts     # Platform-specific API integration
├── {platform}.processor.ts   # Bull queue processor for async jobs
├── {platform}.module.ts      # NestJS module configuration
├── {platform}-api.client.ts  # API client wrapper (if needed)
└── {platform}-media.service.ts  # Media handling (if needed)
```

**Key Interface**: All platforms implement `PlatformAdapter` from `src/common/interfaces/platform.interface.ts`:
- `post(content: PostContent): Promise<PostResult>` - Queue a post
- `validateContent(content: PostContent): ValidationResult` - Validate against platform limits
- `getPostStatus(jobId: string): Promise<PostResult>` - Check job status

### Queue System Architecture

**Separate Bull queue per platform**:
- `linkedin-posts`
- `twitter-posts`
- `bluesky-posts`
- `tiktok-posts`
- `pinterest-posts`
- `instagram-posts`

**Retry configuration**: 3 attempts with exponential backoff (2s, 4s, 8s)

**Flow**:
1. Controller receives POST request → validates DTO
2. Adapter validates content → adds job to platform-specific queue
3. Processor picks up job → calls Service to publish
4. Service interacts with platform API → returns result
5. Database tracks status in `platform_posts` table

### Database Schema

**Core Tables**:

1. **posts** - Parent post entity
   - `id` (UUID)
   - `content` (text)
   - `status` (pending | processing | completed | failed)
   - `created_at`, `scheduled_for`

2. **platform_posts** - Child records per platform
   - `id` (UUID)
   - `post_id` (FK to posts)
   - `platform` (linkedin | twitter | bluesky | tiktok | pinterest | instagram)
   - `platform_post_id` (ID from platform API)
   - `status` (queued | posted | failed)
   - `posted_at`, `url`, `error_message`

3. **social_connections** - OAuth tokens for social platforms
   - `id` (UUID)
   - `user_id` (FK to better-auth user table)
   - `platform` (linkedin | twitter | tiktok | pinterest | instagram | youtube)
   - `display_name` - User-friendly name for the connection
   - `access_token`, `refresh_token`
   - `expires_at`, `refresh_expires_at`
   - `platform_user_id`, `platform_username`
   - `scopes`, `metadata`, `is_active`
   - Unique constraint on (`user_id`, `platform`, `platform_user_id`) - allows multiple accounts per platform

**Better-Auth Tables** (auto-created):
- `user` - User accounts
- `session` - Active sessions
- `account` - OAuth accounts (Google, GitHub)
- `verification` - Email verification tokens

### OAuth Services

All platform OAuth services extend `BaseOAuthService` (`src/auth/base-oauth.service.ts`):
- `LinkedInOAuthService`
- `TwitterOAuthService` (uses PKCE)
- `TikTokOAuthService`
- `PinterestOAuthService`
- `InstagramOAuthService` (via Meta Graph API)
- `YouTubeOAuthService` (via Google OAuth)

## Platform-Specific Notes

### Character Limits
- LinkedIn: 3000 characters
- Twitter: 280 characters
- Bluesky: 300 characters
- TikTok: Video platform (different constraints)
- Pinterest: Image-focused with descriptions
- Instagram: 2200 characters (caption), max 30 hashtags

### Media Handling
Each platform has its own media upload flow:
- LinkedIn: Register upload → upload binary → create post with asset URN
- Twitter: Upload media → get media_id → attach to tweet
- Bluesky: Upload blob → get blob reference → embed in post
- Pinterest: Requires media URL (external or uploaded)
- TikTok: Video upload via chunked upload API
- Instagram: Container-based 2-step flow (create container → publish)

## API Structure

### User Authentication (better-auth)
All routes at `/api/auth/*`:
- `POST /api/auth/sign-up/email` - Email/password signup
- `POST /api/auth/sign-in/email` - Email/password login
- `GET /api/auth/sign-in/social?provider=google` - Google OAuth
- `GET /api/auth/sign-in/social?provider=github` - GitHub OAuth
- `POST /api/auth/sign-out` - Logout

### Social Connections (requires authentication)
- `GET /api/connections` - List all connected platforms
- `GET /api/connections/:platform/connect` - Initiate platform OAuth
- `GET /api/connections/:platform/callback` - OAuth callback
- `DELETE /api/connections/:id` - Disconnect a platform
- `POST /api/connections/:id/refresh` - Force token refresh
- `GET /api/connections/details/:id` - Get connection details

### Posting
- `POST /api/posts/multi-platform` - Create multi-platform post
- `GET /api/posts/:id` - Get post status across all platforms

### System
- `GET /health` - Health check (database + redis)
- `GET /api/queues/status` - Queue status for all platforms

**Swagger docs**: http://localhost:3000/api/docs

## TypeScript Configuration

- Uses `nodenext` module resolution
- Target: ES2023
- Decorators enabled (`experimentalDecorators`, `emitDecoratorMetadata`)
- Strict null checks enabled
- Output directory: `./dist`

## Environment Variables

Required variables are in `.env.example`. Key ones:

**Infrastructure**:
- `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME`
- `REDIS_HOST`, `REDIS_PORT`

**Better Auth (User Authentication)**:
- `BETTER_AUTH_SECRET` - Secret for signing tokens
- `BETTER_AUTH_URL` - Base URL for OAuth callbacks (default: http://localhost:3000)
- `FRONTEND_URL` - Frontend URL for CORS (default: http://localhost:5173)

**User Login Providers** (Google/GitHub):
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`

**Social Platform Credentials**:
- LinkedIn: `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `LINKEDIN_REDIRECT_URI`
- Twitter: `TWITTER_CLIENT_ID`, `TWITTER_CLIENT_SECRET`, `TWITTER_OAUTH_REDIRECT_URI`
- Bluesky: `BLUESKY_HANDLE`, `BLUESKY_APP_PASSWORD`
- TikTok: `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_REDIRECT_URI`
- Pinterest: `PINTEREST_APP_ID`, `PINTEREST_APP_SECRET`, `PINTEREST_REDIRECT_URI`
- Instagram: `META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI`
- YouTube: `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REDIRECT_URI`

## Adding a New Platform

1. Create directory: `src/platforms/{platform}/`
2. Implement files:
   - `{platform}.adapter.ts` - Implement `PlatformAdapter`
   - `{platform}.service.ts` - API integration logic
   - `{platform}.processor.ts` - Queue processor with `@Processor('{platform}-posts')`
   - `{platform}.module.ts` - Register queue, export adapter
3. Update `src/common/interfaces/platform.interface.ts`:
   - Add platform to `Platform` enum
4. Register queue in `src/app.module.ts`:
   - Import module
   - Add to `BullModule.registerQueue()`
5. Create OAuth service in `src/auth/services/` if platform requires OAuth
6. Update `docker-compose.yml` if new env vars needed

## Testing Conventions

- Unit test files: `*.spec.ts` next to source files
- Test root: `src/` directory
- E2E tests: `test/` directory with `jest-e2e.json` config
- Use NestJS testing utilities (`@nestjs/testing`)
- Mock external API calls in unit tests

## Git Workflow

**Main branch**: `main`
**CI checks** on `develop` and `main` branches:
1. Format check (`pnpm run format:check`)
2. Lint check (`pnpm run lint:check`)
3. Tests (`pnpm test`)
4. Build (`pnpm run build`)

**Pre-commit hooks** (via Husky):
- Runs Prettier and ESLint on staged `.ts` files

## Code Style

- Uses Prettier for formatting
- ESLint with TypeScript rules
- NestJS architectural patterns (modules, controllers, services, processors)
- Dependency injection via constructor
- Use NestJS `Logger` for logging (avoid `console.log`)
- Validation with `class-validator` decorators on DTOs
- Error handling: catch in processors, log with context, throw to trigger retry

## Database Migration

To migrate from the old `oauth_tokens` table to `social_connections`:

```bash
# Run the migration SQL (in postgres)
psql -f src/database/migrations/001-cleanup-legacy-tables.sql
```

This migration:
1. Drops the legacy `tiktok_auth` table
2. Creates the new `social_connections` table
3. Migrates data from `oauth_tokens` if it exists
4. Drops the old `oauth_tokens` table
