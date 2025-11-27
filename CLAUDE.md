# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Social Flood is a NestJS application for posting content simultaneously to multiple social media platforms (LinkedIn, Twitter, Bluesky, TikTok, Pinterest). It uses a queue-based architecture with Bull/Redis for reliable asynchronous job processing and PostgreSQL for persistence.

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

**Retry configuration**: 3 attempts with exponential backoff (2s, 4s, 8s)

**Flow**:
1. Controller receives POST request → validates DTO
2. Adapter validates content → adds job to platform-specific queue
3. Processor picks up job → calls Service to publish
4. Service interacts with platform API → returns result
5. Database tracks status in `platform_posts` table

### Database Schema

**Two-table design**:

1. **posts** - Parent post entity
   - `id` (UUID)
   - `content` (text)
   - `status` (pending | processing | completed | failed)
   - `created_at`, `scheduled_for`

2. **platform_posts** - Child records per platform
   - `id` (UUID)
   - `post_id` (FK to posts)
   - `platform` (linkedin | twitter | bluesky | tiktok | pinterest)
   - `platform_post_id` (ID from platform API)
   - `status` (queued | posted | failed)
   - `posted_at`, `url`, `error_message`

Additional entities:
- **oauth_token** - OAuth tokens for LinkedIn
- **tiktok_auth** - TikTok OAuth credentials and refresh tokens

### Authentication

**AuthModule** (`src/auth/`) currently handles OAuth flows for platforms requiring it:
- TikTok uses OAuth 2.0 with refresh tokens
- Pinterest uses OAuth 2.0
- LinkedIn uses static access tokens (OAuth flow not yet implemented)
- Twitter uses OAuth 1.0a with static credentials
- Bluesky uses app passwords

## Platform-Specific Notes

### Character Limits
- LinkedIn: 3000 characters
- Twitter: 280 characters
- Bluesky: 300 characters
- TikTok: Video platform (different constraints)
- Pinterest: Image-focused with descriptions

### Media Handling
Each platform has its own media upload flow:
- LinkedIn: Register upload → upload binary → create post with asset URN
- Twitter: Upload media → get media_id → attach to tweet
- Bluesky: Upload blob → get blob reference → embed in post
- Pinterest: Requires media URL (external or uploaded)
- TikTok: Video upload via chunked upload API

### OAuth Flows
- TikTok and Pinterest have OAuth callback endpoints at `/api/auth/{platform}/callback`
- Tokens are stored in database and automatically refreshed when expired
- Use `TikTokAuthService` and `PinterestAuthService` for token management

## API Structure

**Main endpoint**: `POST /api/posts/multi-platform`
- Body: `CreatePostDto` (text, media, link, platforms array, optional tiktokUserId)
- Returns: Job IDs for each platform queue

**Other endpoints**:
- `GET /api/posts/:id` - Get post status across all platforms
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

**Platform Credentials**:
- LinkedIn: `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`
- Twitter: `TWITTER_API_KEY`, `TWITTER_API_SECRET`, `TWITTER_ACCESS_TOKEN`, `TWITTER_ACCESS_TOKEN_SECRET`
- Bluesky: `BLUESKY_HANDLE`, `BLUESKY_APP_PASSWORD`
- TikTok: `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_REDIRECT_URI`
- Pinterest: `PINTEREST_APP_ID`, `PINTEREST_APP_SECRET`, `PINTEREST_REDIRECT_URI`

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
5. Update `docker-compose.yml` if new env vars needed

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
