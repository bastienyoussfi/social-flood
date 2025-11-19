# Reddit Integration

Complete Reddit posting integration for social-flood, supporting text posts, link posts, and media uploads.

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Setup](#setup)
- [Configuration](#configuration)
- [Usage](#usage)
- [API Reference](#api-reference)
- [Reddit API Details](#reddit-api-details)
- [Limitations](#limitations)
- [Troubleshooting](#troubleshooting)

## Features

- ✅ **OAuth2 Authentication** - Secure token-based authentication with automatic refresh
- ✅ **Text Posts** - Create self posts with markdown support
- ✅ **Link Posts** - Share URLs with titles
- ✅ **Media Posts** - Upload images and videos via Reddit's S3 infrastructure
- ✅ **Queue-Based Processing** - Asynchronous posting with retry logic
- ✅ **Character Validation** - Enforces Reddit's title (300 chars) and text (40,000 chars) limits
- ✅ **Subreddit Targeting** - Post to specific subreddits
- ✅ **Error Handling** - Comprehensive error parsing and reporting

## Architecture

The Reddit integration follows the established adapter pattern used across all platforms:

```
RedditAdapter (Queue Interface)
    ↓
RedditProcessor (Bull Queue)
    ↓
RedditService (Business Logic)
    ↓
RedditApiClient (OAuth2 + API)
RedditMediaService (S3 Upload)
```

### Components

| Component | Purpose |
|-----------|---------|
| `reddit.adapter.ts` | Implements PlatformAdapter interface, validates content, queues jobs |
| `reddit.processor.ts` | Processes jobs from Bull queue |
| `reddit.service.ts` | Orchestrates posting logic (text/link/media) |
| `reddit-api.client.ts` | Handles OAuth2 authentication and Reddit API communication |
| `reddit-media.service.ts` | Manages media uploads via Reddit's S3 infrastructure |
| `reddit-queue.service.ts` | Updates database on job completion/failure |
| `reddit.module.ts` | NestJS module configuration |

## Setup

### 1. Create a Reddit Application

1. Go to [Reddit App Preferences](https://www.reddit.com/prefs/apps)
2. Scroll to "Developed Applications" and click **"create another app..."**
3. Fill in the form:
   - **name**: Your application name (e.g., "social-flood")
   - **App type**: Select **"script"** (for personal use) or **"web app"** (for hosted apps)
   - **description**: Brief description of your app
   - **about url**: Your website (optional)
   - **redirect uri**: `http://localhost` (required but unused for script apps)
4. Click **"create app"**
5. Note your credentials:
   - **Client ID**: The string under your app name (e.g., `abc123xyz`)
   - **Client Secret**: The "secret" field

### 2. Configure Environment Variables

Add the following to your `.env` file:

```bash
# Reddit API Configuration
REDDIT_CLIENT_ID=your_client_id_here
REDDIT_CLIENT_SECRET=your_secret_here
REDDIT_USER_AGENT=social-flood/1.0.0 (by /u/your_reddit_username)
REDDIT_DEFAULT_SUBREDDIT=test  # Optional: fallback subreddit
```

**Important**:
- **User-Agent** is **required** by Reddit's API. Format: `AppName/Version (by /u/username)`
- Use `/r/test` for testing - it's an open subreddit that allows all posts

### 3. Test Your Configuration

Start your application and check the logs for successful Reddit authentication:

```bash
npm run start:dev
```

Look for:
```
[RedditApiClient] Authenticating with Reddit API
[RedditApiClient] Successfully authenticated with Reddit API
```

## Configuration

### Environment Variables

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `REDDIT_CLIENT_ID` | Yes | Application client ID from Reddit | `abc123xyz` |
| `REDDIT_CLIENT_SECRET` | Yes | Application secret from Reddit | `xyz789abc` |
| `REDDIT_USER_AGENT` | Yes | User-Agent string (required by Reddit) | `social-flood/1.0.0 (by /u/myusername)` |
| `REDDIT_DEFAULT_SUBREDDIT` | No | Default subreddit if not specified in request | `test` |

### OAuth2 Details

- **Grant Type**: `client_credentials` (application-only OAuth)
- **Token Lifetime**: 1 hour (3600 seconds)
- **Auto-Refresh**: Tokens are automatically refreshed 5 minutes before expiry
- **Scopes**: `submit` (for posting)
- **API Base**: `https://oauth.reddit.com` (NOT www.reddit.com)

## Usage

### Basic Text Post

```bash
POST /api/posts/multi-platform
Content-Type: application/json

{
  "text": "This is my first Reddit post!",
  "platforms": ["reddit"],
  "title": "My First Post",
  "subreddit": "test"
}
```

### Text Post with Link

```bash
POST /api/posts/multi-platform
Content-Type: application/json

{
  "text": "Check out this amazing article!",
  "link": "https://example.com/article",
  "platforms": ["reddit"],
  "title": "Amazing Article You Should Read",
  "subreddit": "technology"
}
```

### Post with Media

```bash
POST /api/posts/multi-platform
Content-Type: application/json

{
  "text": "Look at this cool image!",
  "media": [
    {
      "url": "https://example.com/image.jpg",
      "type": "image",
      "alt": "A cool image"
    }
  ],
  "platforms": ["reddit"],
  "title": "Cool Image I Found",
  "subreddit": "pics"
}
```

### Multi-Platform Post (Including Reddit)

```bash
POST /api/posts/multi-platform
Content-Type: application/json

{
  "text": "Sharing across all platforms!",
  "platforms": ["linkedin", "twitter", "bluesky", "reddit"],
  "title": "Multi-Platform Announcement",
  "subreddit": "announcements"
}
```

### Response Format

```json
{
  "postId": "550e8400-e29b-41d4-a716-446655440000",
  "results": {
    "reddit": {
      "jobId": "123",
      "status": "queued",
      "platform": "reddit"
    }
  }
}
```

After processing:

```bash
GET /api/posts/:postId
```

```json
{
  "postId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "completed",
  "platforms": [
    {
      "platform": "reddit",
      "status": "posted",
      "url": "https://reddit.com/r/test/comments/abc123/my_first_post/",
      "postedAt": "2025-11-19T10:30:00.000Z"
    }
  ]
}
```

## API Reference

### Reddit-Specific Fields

#### Title (Required)

- **Type**: String
- **Max Length**: 300 characters
- **Description**: Post title shown in Reddit feed
- **Validation**: Must not be empty

```json
{
  "title": "This is the post title"
}
```

#### Subreddit (Required)

- **Type**: String
- **Format**: Subreddit name without `/r/` prefix
- **Description**: Target subreddit for the post
- **Validation**: No spaces allowed

```json
{
  "subreddit": "technology"
}
```

**Note**: If `REDDIT_DEFAULT_SUBREDDIT` is configured, subreddit becomes optional and defaults to that value.

### Content Limits

| Field | Limit | Notes |
|-------|-------|-------|
| Title | 300 characters | Enforced by adapter validation |
| Text | 40,000 characters | Self posts only |
| Media | 1 attachment | Current limitation |
| Images | PNG, JPEG, GIF | Max 20MB |
| Videos | MP4, MOV | Max 1GB, 1080p, 30fps |

## Reddit API Details

### Authentication Flow

1. **Request Token** (on first API call or when expired):
   ```
   POST https://www.reddit.com/api/v1/access_token
   Authorization: Basic base64(client_id:client_secret)
   User-Agent: social-flood/1.0.0
   Body: grant_type=client_credentials
   ```

2. **Receive Token**:
   ```json
   {
     "access_token": "abc123...",
     "token_type": "bearer",
     "expires_in": 3600,
     "scope": "*"
   }
   ```

3. **Use Token** (auto-refreshed):
   ```
   Authorization: bearer abc123...
   User-Agent: social-flood/1.0.0
   ```

### Post Submission

**Endpoint**: `POST https://oauth.reddit.com/api/submit`

**Text Post** (kind=self):
```
sr=test&kind=self&title=My+Title&text=My+text+content&api_type=json
```

**Link Post** (kind=link):
```
sr=test&kind=link&title=My+Title&url=https://example.com&api_type=json
```

**Response**:
```json
{
  "json": {
    "data": {
      "id": "abc123",
      "name": "t3_abc123",
      "url": "https://reddit.com/r/test/comments/abc123/my_title/"
    },
    "errors": []
  }
}
```

### Media Upload (3-Step Process)

1. **Request Upload URL**:
   ```
   POST https://oauth.reddit.com/api/media/asset.json
   Body: filepath=image.jpg&mimetype=image/jpeg
   ```

2. **Upload to S3**:
   ```
   POST <s3_url_from_step_1>
   Body: multipart/form-data with fields + file
   ```

3. **Submit Post with Media URL**:
   ```
   POST https://oauth.reddit.com/api/submit
   Body: sr=pics&kind=link&title=My+Image&url=<media_url>
   ```

### Rate Limits

- **Free Tier**: 100 queries per minute (QPM)
- **Window**: Averaged over 10 minutes
- **Retry Logic**: 3 attempts with exponential backoff (2s, 4s, 8s)

### Common Errors

| Error Code | Message | Solution |
|------------|---------|----------|
| `RATELIMIT` | "you are doing that too much" | Wait before retrying |
| `SUBREDDIT_NOEXIST` | "that subreddit doesn't exist" | Check subreddit name spelling |
| `NO_TEXT` | Text post submitted without text | Ensure text field is provided |
| `INVALID_OPTION` | Invalid post type | Check kind parameter (self/link) |
| `USER_REQUIRED` | Authentication required | Check OAuth token |

## Limitations

1. **Media**: Currently supports 1 media attachment per post (Reddit galleries not yet implemented)
2. **OAuth Scope**: Uses application-only OAuth (posts as app, not as user)
3. **Subreddit Permissions**: Some subreddits require minimum karma or account age
4. **Markdown**: Reddit supports markdown, but no conversion from other platforms' formatting
5. **Scheduled Posts**: Not supported by Reddit API (queue handles async, not scheduling)

## Troubleshooting

### "Reddit API is not properly configured"

**Cause**: Missing or invalid environment variables.

**Solution**:
1. Verify `.env` file contains all required Reddit variables
2. Check that values are not empty strings
3. Restart the application after updating `.env`

### "Reddit authentication failed"

**Cause**: Invalid client credentials or network issues.

**Solutions**:
- Verify Client ID and Secret from Reddit app preferences
- Check User-Agent format (must include app name and username)
- Ensure application type is "script" for personal use
- Test credentials manually:
  ```bash
  curl -X POST https://www.reddit.com/api/v1/access_token \
    -u "client_id:client_secret" \
    -H "User-Agent: social-flood/1.0.0" \
    -d "grant_type=client_credentials"
  ```

### "Title is required for Reddit posts"

**Cause**: Reddit posts require a title field.

**Solution**: Include `title` in your POST request:
```json
{
  "title": "Your post title here",
  "subreddit": "test",
  ...
}
```

### "Subreddit is required for Reddit posts"

**Cause**: No subreddit specified and no default configured.

**Solutions**:
- Include `subreddit` in your request
- OR set `REDDIT_DEFAULT_SUBREDDIT` in `.env`

### "that subreddit doesn't exist"

**Cause**: Subreddit name is misspelled or doesn't exist.

**Solutions**:
- Verify subreddit exists by visiting `https://reddit.com/r/subreddit_name`
- Remove `/r/` prefix (use `technology`, not `/r/technology`)
- Check for typos in subreddit name

### "you aren't allowed to post there"

**Cause**: Subreddit has restrictions (karma, age, approved submitters).

**Solutions**:
- Use `/r/test` for testing (no restrictions)
- Build karma by participating in the subreddit first
- Contact subreddit moderators for approval
- Check subreddit rules for posting requirements

### Media upload fails

**Cause**: Unsupported format, file too large, or S3 connection issues.

**Solutions**:
- Check file format (PNG, JPEG, GIF for images; MP4, MOV for videos)
- Verify file size (images < 20MB, videos < 1GB)
- Ensure media URL is accessible
- Check application logs for detailed error messages

### Rate limit errors

**Cause**: Exceeding 100 QPM limit.

**Solution**:
- Queue automatically retries with backoff
- Spread requests over time
- Contact Reddit for commercial API access if needed

## Testing

### Unit Tests

Run Reddit integration tests:

```bash
npm run test -- reddit
```

### Integration Testing

1. **Test Authentication**:
   ```bash
   npm run start:dev
   # Check logs for "Successfully authenticated with Reddit API"
   ```

2. **Test Text Post**:
   ```bash
   curl -X POST http://localhost:3000/api/posts/multi-platform \
     -H "Content-Type: application/json" \
     -d '{
       "text": "Test post from social-flood",
       "platforms": ["reddit"],
       "title": "Test Post",
       "subreddit": "test"
     }'
   ```

3. **Verify Post**:
   - Check response for `jobId`
   - Poll `/api/posts/:postId` for status
   - Visit returned URL to see post on Reddit

## Technical Notes

### Token Management

- Tokens stored in memory (not persisted)
- Auto-refresh 5 minutes before expiry
- All requests check token validity
- Failed auth triggers re-authentication

### Queue Configuration

- **Queue Name**: `reddit-posts`
- **Attempts**: 3
- **Backoff**: Exponential (2s, 4s, 8s)
- **Processor**: Single job processing

### Database Schema

Posts are tracked in `platform_posts` table:

| Column | Type | Description |
|--------|------|-------------|
| `platform` | VARCHAR | Set to `'reddit'` |
| `platform_post_id` | VARCHAR | Reddit post ID (e.g., `t3_abc123`) |
| `url` | VARCHAR | Full Reddit permalink |
| `status` | ENUM | `queued`, `posted`, `failed` |
| `posted_at` | TIMESTAMP | When post was published |
| `error_message` | TEXT | Error details if failed |

## References

- [Reddit OAuth2 Documentation](https://github.com/reddit-archive/reddit/wiki/OAuth2)
- [Reddit API Submit Endpoint](https://github.com/reddit-archive/reddit/wiki/api:-submit)
- [Reddit Data API Wiki](https://support.reddithelp.com/hc/en-us/articles/16160319875092-Reddit-Data-API-Wiki)
- [Reddit API Rules](https://www.reddit.com/wiki/api/)

## Support

For issues or questions:

1. Check this README for common solutions
2. Review application logs for detailed error messages
3. Test with `/r/test` subreddit to isolate issues
4. Verify Reddit API status: [Reddit Status](https://www.redditstatus.com/)

---

**Last Updated**: 2025-11-19
**API Version**: Reddit API (OAuth2)
**Implementation**: social-flood v1.0.0
