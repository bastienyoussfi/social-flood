# Social Media Poster

A NestJS application that posts content simultaneously to LinkedIn, Twitter, and Bluesky. Built with TypeScript, PostgreSQL, Redis, and Bull for robust queue management.

## Features

- **Multi-platform posting**: Post to LinkedIn, Twitter, and Bluesky simultaneously
- **Queue-based architecture**: Uses Bull and Redis for reliable job processing
- **Platform-specific validation**: Validates content against each platform's requirements
- **Database persistence**: Tracks all posts and their status across platforms
- **Retry mechanism**: Automatic retries with exponential backoff for failed posts
- **Health monitoring**: Health check and queue status endpoints
- **API documentation**: Built-in Swagger/OpenAPI documentation
- **Docker support**: Complete Docker Compose setup for local development

## Tech Stack

- **Framework**: NestJS
- **Language**: TypeScript
- **Database**: PostgreSQL with TypeORM
- **Cache/Queue**: Redis with Bull
- **API Documentation**: Swagger/OpenAPI
- **Validation**: class-validator & class-transformer
- **Containerization**: Docker & Docker Compose

## Project Structure

```
social-media-poster/
├── src/
│   ├── config/               # Configuration files
│   │   ├── database.config.ts
│   │   └── redis.config.ts
│   ├── common/               # Shared resources
│   │   ├── interfaces/       # TypeScript interfaces
│   │   ├── dto/              # Data Transfer Objects
│   │   └── decorators/       # Custom decorators
│   ├── database/
│   │   ├── entities/         # TypeORM entities
│   │   └── migrations/       # Database migrations
│   ├── posts/                # Posts module
│   │   ├── posts.controller.ts
│   │   ├── posts.service.ts
│   │   ├── posts.module.ts
│   │   └── dto/
│   ├── platforms/            # Platform integrations
│   │   ├── linkedin/
│   │   │   ├── linkedin.adapter.ts
│   │   │   ├── linkedin.service.ts
│   │   │   ├── linkedin.processor.ts
│   │   │   └── linkedin.module.ts
│   │   ├── twitter/
│   │   │   ├── twitter.adapter.ts
│   │   │   ├── twitter.service.ts
│   │   │   ├── twitter.processor.ts
│   │   │   └── twitter.module.ts
│   │   └── bluesky/
│   │       ├── bluesky.adapter.ts
│   │       ├── bluesky.service.ts
│   │       ├── bluesky.processor.ts
│   │       └── bluesky.module.ts
│   ├── app.module.ts
│   └── main.ts
├── docker-compose.yml
├── Dockerfile
├── .env.example
└── README.md
```

## Architecture Overview

### Platform Adapter Pattern

Each social media platform has its own module with:
- **Adapter**: Implements the `PlatformAdapter` interface
- **Service**: Handles platform-specific API calls
- **Processor**: Bull queue processor for async job handling
- **Module**: Configures and exports platform components

### Queue System

- **Queue per platform**: Separate Bull queues for LinkedIn, Twitter, and Bluesky
- **Retry logic**: 3 attempts with exponential backoff (2s, 4s, 8s)
- **Job tracking**: All jobs tracked in database with status updates

### Database Schema

**Posts Table**:
- `id`: UUID primary key
- `content`: Post text content
- `status`: pending | processing | completed | failed
- `created_at`: Timestamp
- `scheduled_for`: Optional scheduled time

**Platform Posts Table**:
- `id`: UUID primary key
- `post_id`: Foreign key to posts
- `platform`: Platform name (linkedin, twitter, bluesky)
- `platform_post_id`: ID from platform API
- `status`: queued | posted | failed
- `posted_at`: Timestamp when posted
- `url`: Link to posted content
- `error_message`: Error details if failed

## Getting Started

### Prerequisites

- Node.js 20+
- Docker & Docker Compose (for local development)
- Platform API credentials (LinkedIn, Twitter, Bluesky)

### Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd social-media-poster
```

2. **Install dependencies**
```bash
npm install
```

3. **Set up environment variables**
```bash
cp .env.example .env
```

Edit `.env` and add your platform credentials:
```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=poster
DB_PASSWORD=postgres
DB_NAME=social_poster

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# LinkedIn API
LINKEDIN_CLIENT_ID=your_linkedin_client_id
LINKEDIN_CLIENT_SECRET=your_linkedin_client_secret

# Twitter API
TWITTER_API_KEY=your_twitter_api_key
TWITTER_API_SECRET=your_twitter_api_secret

# Bluesky
BLUESKY_HANDLE=your_handle.bsky.social
BLUESKY_APP_PASSWORD=your_bluesky_app_password
```

### Running with Docker Compose

The easiest way to run the entire stack:

```bash
# Start all services (PostgreSQL, Redis, App)
docker-compose up -d

# View logs
docker-compose logs -f app

# Stop all services
docker-compose down

# Stop and remove volumes
docker-compose down -v
```

The application will be available at:
- **API**: http://localhost:3000
- **Swagger Docs**: http://localhost:3000/api/docs

### Running Locally (without Docker)

1. **Start PostgreSQL and Redis** (via Docker or locally)
```bash
# Just database and redis
docker-compose up -d postgres redis
```

2. **Run the application**
```bash
# Development mode
npm run start:dev

# Production build
npm run build
npm run start:prod
```

## API Documentation

### Swagger UI

Access the interactive API documentation at: http://localhost:3000/api/docs

### Endpoints

#### Create Multi-Platform Post
```http
POST /api/posts/multi-platform
Content-Type: application/json

{
  "text": "Check out our new product! #tech #innovation",
  "platforms": ["linkedin", "twitter", "bluesky"],
  "media": [
    {
      "url": "https://example.com/image.jpg",
      "type": "image",
      "alt": "Product screenshot"
    }
  ],
  "link": "https://example.com"
}
```

**Response**:
```json
{
  "postId": "uuid",
  "results": {
    "linkedin": {
      "jobId": "123",
      "status": "queued",
      "platform": "linkedin"
    },
    "twitter": {
      "jobId": "456",
      "status": "queued",
      "platform": "twitter"
    },
    "bluesky": {
      "jobId": "789",
      "status": "queued",
      "platform": "bluesky"
    }
  }
}
```

#### Get Post Status
```http
GET /api/posts/:id
```

#### Health Check
```http
GET /health
```

**Response**:
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "services": {
    "database": "connected",
    "redis": "connected"
  }
}
```

#### Queue Status
```http
GET /api/queues/status
```

**Response**:
```json
{
  "timestamp": "2024-01-01T00:00:00.000Z",
  "queues": {
    "linkedIn": {
      "name": "linkedin-posts",
      "waiting": 0,
      "active": 1,
      "completed": 42,
      "failed": 2,
      "delayed": 0
    },
    "twitter": { ... },
    "bluesky": { ... }
  }
}
```

## Platform Validation Rules

### LinkedIn
- **Character limit**: 3000 characters
- **Media**: Supports images and videos
- **Rich content**: Supports rich media and formatting

### Twitter
- **Character limit**: 280 characters
- **Media**: Maximum 4 images per tweet
- **Links**: URLs count toward character limit

### Bluesky
- **Character limit**: 300 characters
- **Media**: Supports images and videos
- **Links**: Supports embedded links

## Development

### Running Tests
```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Test coverage
npm run test:cov
```

### Database Migrations
```bash
# Generate migration
npm run typeorm migration:generate -- -n MigrationName

# Run migrations
npm run typeorm migration:run

# Revert migration
npm run typeorm migration:revert
```

### Linting & Formatting
```bash
# Lint
npm run lint

# Format
npm run format
```

## Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `NODE_ENV` | Environment (development/production) | `development` | No |
| `PORT` | Application port | `3000` | No |
| `DB_HOST` | PostgreSQL host | `localhost` | Yes |
| `DB_PORT` | PostgreSQL port | `5432` | No |
| `DB_USERNAME` | Database username | `poster` | Yes |
| `DB_PASSWORD` | Database password | - | Yes |
| `DB_NAME` | Database name | `social_poster` | Yes |
| `REDIS_HOST` | Redis host | `localhost` | Yes |
| `REDIS_PORT` | Redis port | `6379` | No |
| `LINKEDIN_CLIENT_ID` | LinkedIn OAuth client ID | - | Yes |
| `LINKEDIN_CLIENT_SECRET` | LinkedIn OAuth secret | - | Yes |
| `TWITTER_API_KEY` | Twitter API key | - | Yes |
| `TWITTER_API_SECRET` | Twitter API secret | - | Yes |
| `BLUESKY_HANDLE` | Bluesky handle | - | Yes |
| `BLUESKY_APP_PASSWORD` | Bluesky app password | - | Yes |

## Production Deployment

### Building for Production
```bash
npm run build
```

### Docker Production Build
```bash
docker build -t social-media-poster:latest .
docker run -p 3000:3000 --env-file .env social-media-poster:latest
```

### Recommendations
- Use a process manager (PM2) or container orchestration (Kubernetes)
- Set up monitoring (Prometheus + Grafana)
- Configure logging (Winston + ELK stack)
- Enable database migrations
- Set `NODE_ENV=production`
- Use secrets management for API credentials
- Configure rate limiting
- Set up SSL/TLS certificates

## Roadmap

- [ ] Implement actual platform API integrations
- [ ] Add OAuth authentication flow
- [ ] Support scheduled posts
- [ ] Add media upload handling
- [ ] Implement post analytics
- [ ] Add webhook support for post status updates
- [ ] Create admin dashboard
- [ ] Add rate limiting per platform
- [ ] Support for Instagram and Facebook
- [ ] Implement post templates
- [ ] Add user authentication and multi-tenancy

## Troubleshooting

### Database Connection Issues
- Ensure PostgreSQL is running: `docker-compose ps`
- Check credentials in `.env`
- Verify network connectivity

### Redis Connection Issues
- Ensure Redis is running: `docker-compose ps`
- Check Redis host/port in `.env`

### Platform API Errors
- Verify API credentials are correct
- Check platform API rate limits
- Review platform-specific error messages in logs

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

MIT

## Support

For issues and questions, please open an issue on GitHub.
