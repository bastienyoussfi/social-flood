# Twitter Integration Module

Complete, production-ready Twitter integration for posting tweets with text and media using Twitter API v2.

## Architecture

This module follows a modular, layered architecture for maintainability and testability:

```
TwitterModule
├── TwitterAdapter         → Queue interface (validates & queues jobs)
├── TwitterProcessor       → Processes queue jobs
├── TwitterService         → Orchestrates posting logic
├── TwitterApiClient       → Twitter API v2 communication
└── TwitterMediaService    → Media download & upload
```

### Component Responsibilities

#### **TwitterAdapter**
- Validates post content (character limits, media count)
- Adds jobs to Bull queue
- Returns job status
- **Does NOT** make API calls directly

#### **TwitterProcessor**
- Processes jobs from the queue
- Calls TwitterService to publish
- Handles retries (3 attempts with exponential backoff)

#### **TwitterService**
- Orchestrates the posting process
- Coordinates between API client and media service
- Handles business logic and error transformation

#### **TwitterApiClient**
- Direct Twitter API v2 communication
- OAuth 1.0a authentication
- Tweet creation with media
- Error handling and rate limit detection

#### **TwitterMediaService**
- Downloads media from URLs
- Uploads to Twitter (v1.1 endpoint)
- Validates media (type, size, count)
- Adds alt text to images

## Features

✅ **Text Posting**: Up to 280 characters
✅ **Image Support**: Up to 4 images per tweet
✅ **Alt Text**: Automatic alt text for accessibility
✅ **Link Handling**: Auto-appends links to tweets
✅ **Queue-Based**: Async processing with retries
✅ **Error Handling**: Detailed error messages and logging
✅ **Rate Limit Detection**: Identifies rate limit errors
✅ **OAuth 1.0a**: Proper authentication for posting

🔜 **Coming Soon**:
- Video support
- Thread creation
- Polls
- Scheduled tweets

## Configuration

### Required Environment Variables

```bash
# OAuth 1.0a credentials (REQUIRED for posting)
TWITTER_API_KEY=your_api_key_here
TWITTER_API_SECRET=your_api_secret_here
TWITTER_ACCESS_TOKEN=your_access_token_here
TWITTER_ACCESS_TOKEN_SECRET=your_access_token_secret_here

# Bearer token (OPTIONAL, for read-only operations)
TWITTER_BEARER_TOKEN=your_bearer_token_here
```

### Getting Twitter Credentials

1. **Create a Twitter Developer Account**
   - Go to https://developer.twitter.com/
   - Apply for a developer account
   - Create a new app

2. **Generate OAuth 1.0a Credentials**
   - In your app settings, go to "Keys and Tokens"
   - Generate API Key and Secret
   - Generate Access Token and Secret
   - Copy all credentials to your `.env` file

3. **Set Permissions**
   - Ensure your app has **Read and Write** permissions
   - Regenerate tokens if you change permissions

## Usage

### Basic Text Tweet

```typescript
POST /api/posts/multi-platform
{
  "text": "Hello from my app! 🚀",
  "platforms": ["twitter"]
}
```

### Tweet with Link

```typescript
POST /api/posts/multi-platform
{
  "text": "Check out this awesome article!",
  "link": "https://example.com/article",
  "platforms": ["twitter"]
}
```

### Tweet with Images

```typescript
POST /api/posts/multi-platform
{
  "text": "Amazing photos from today! 📸",
  "platforms": ["twitter"],
  "media": [
    {
      "url": "https://example.com/image1.jpg",
      "type": "image",
      "alt": "Sunset over mountains"
    },
    {
      "url": "https://example.com/image2.jpg",
      "type": "image",
      "alt": "Close-up of flower"
    }
  ]
}
```

### Multi-Platform Post

```typescript
POST /api/posts/multi-platform
{
  "text": "Posting to all platforms at once!",
  "platforms": ["twitter", "linkedin", "bluesky"],
  "media": [
    {
      "url": "https://example.com/image.jpg",
      "type": "image"
    }
  ]
}
```

## Response Format

### Success Response

```json
{
  "postId": "123e4567-e89b-12d3-a456-426614174000",
  "results": {
    "twitter": {
      "jobId": "1",
      "status": "queued",
      "platform": "twitter"
    }
  }
}
```

### After Job Processing

The tweet is posted asynchronously. Check status:

```typescript
GET /api/posts/:postId

{
  "postId": "123e4567-e89b-12d3-a456-426614174000",
  "status": "completed",
  "platforms": [
    {
      "platform": "twitter",
      "status": "posted",
      "url": "https://twitter.com/i/web/status/1234567890",
      "postedAt": "2024-01-01T12:00:00.000Z"
    }
  ]
}
```

## Validation Rules

### Text Validation
- **Required**: Tweet text cannot be empty
- **Max Length**: 280 characters
- **URLs**: Links are automatically shortened by Twitter

### Media Validation
- **Max Count**: 4 images per tweet
- **Supported Types**: Currently only images (JPG, PNG, GIF, WebP)
- **Max Size**: 5MB per image
- **URL Required**: Each media item must have a valid URL

## Error Handling

### Common Errors

#### Authentication Error
```json
{
  "error": "Twitter authentication failed. Please check your credentials."
}
```
**Solution**: Verify your OAuth credentials in `.env`

#### Rate Limit Error
```json
{
  "error": "Twitter rate limit exceeded. Please try again later."
}
```
**Solution**: Wait before retrying. Twitter allows 300 tweets per 3 hours.

#### Media Upload Error
```json
{
  "error": "Image upload failed: Image exceeds maximum size of 5MB"
}
```
**Solution**: Use smaller images or compress them

#### Validation Error
```json
{
  "error": "Text exceeds Twitter's 280 character limit"
}
```
**Solution**: Shorten your tweet text

## Testing

### Local Testing

1. **Set up credentials**
```bash
cp .env.example .env
# Add your real Twitter credentials
```

2. **Start services**
```bash
docker-compose up -d postgres redis
npm run start:dev
```

3. **Test text-only tweet**
```bash
curl -X POST http://localhost:3000/api/posts/multi-platform \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Test tweet from my app!",
    "platforms": ["twitter"]
  }'
```

4. **Test tweet with image**
```bash
curl -X POST http://localhost:3000/api/posts/multi-platform \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Test tweet with image!",
    "platforms": ["twitter"],
    "media": [{
      "url": "https://picsum.photos/800/600",
      "type": "image",
      "alt": "Random test image"
    }]
  }'
```

5. **Check post status**
```bash
curl http://localhost:3000/api/posts/{postId}
```

### Test with Swagger UI

Navigate to http://localhost:3000/api/docs and use the interactive UI.

## Rate Limits

Twitter enforces the following limits:

- **Tweets**: 300 per 3 hours (user context)
- **Media Uploads**: 500 per day
- **Read Operations**: Varies by endpoint

The module automatically detects rate limit errors and provides clear error messages.

## Logging

The module provides detailed logging at each layer:

```
[TwitterAdapter] Adding Twitter post to queue
[TwitterService] Starting Twitter post publication
[TwitterService] Processing 2 media attachment(s)
[TwitterMediaService] Uploading 2 media item(s) to Twitter
[TwitterMediaService] Downloading media from: https://...
[TwitterMediaService] Downloaded 123456 bytes
[TwitterMediaService] Media 1 uploaded successfully: 1234567890
[TwitterApiClient] Posting tweet: "Hello from my app!"
[TwitterApiClient] Attaching 2 media item(s)
[TwitterApiClient] Tweet posted successfully: https://twitter.com/...
[TwitterService] Tweet published successfully. ID: 1234567890
[TwitterProcessor] Twitter post 1 completed successfully
```

## Architecture Benefits

### 1. **Separation of Concerns**
Each component has a single, clear responsibility:
- Adapter → Queueing
- Processor → Job execution
- Service → Business logic
- ApiClient → API communication
- MediaService → Media handling

### 2. **Testability**
Easy to mock dependencies for unit testing:
```typescript
// Mock TwitterApiClient in tests
const mockApiClient = {
  postTweet: jest.fn().mockResolvedValue({ tweetId: '123', url: '...' })
};
```

### 3. **Reusability**
Components can be reused:
- TwitterApiClient can be used for other Twitter operations (likes, retweets, etc.)
- TwitterMediaService can be extended for videos
- Pattern can be replicated for LinkedIn, Bluesky

### 4. **Maintainability**
Changes are isolated:
- Update API version → Only modify TwitterApiClient
- Change media processing → Only modify TwitterMediaService
- Add new features → Extend without breaking existing code

### 5. **Extensibility**
Easy to add features:
- Threads → Add TwitterThreadService
- Scheduled tweets → Already supported by queue system
- Analytics → Add TwitterAnalyticsService

## Troubleshooting

### Tweet not posting

1. **Check credentials**
```bash
# Verify all required env vars are set
echo $TWITTER_API_KEY
echo $TWITTER_API_SECRET
echo $TWITTER_ACCESS_TOKEN
echo $TWITTER_ACCESS_TOKEN_SECRET
```

2. **Check app permissions**
- Go to Twitter Developer Portal
- Verify app has "Read and Write" permissions
- Regenerate access tokens if needed

3. **Check logs**
```bash
# Look for error messages
docker-compose logs -f app | grep Twitter
```

### Media not uploading

1. **Check image URL is accessible**
```bash
curl -I https://your-image-url.jpg
```

2. **Check image size**
- Must be under 5MB
- Use compressed images

3. **Check image format**
- Supported: JPG, PNG, GIF, WebP
- Not supported yet: Videos

### Rate limit errors

- Twitter allows 300 tweets per 3 hours
- Wait before retrying
- Monitor your usage in Twitter Developer Portal

## Contributing

When extending this module:

1. **Follow the architecture pattern**
   - Keep layers separated
   - Use dependency injection
   - Add proper logging

2. **Add tests**
   - Unit tests for business logic
   - Integration tests for API calls

3. **Update documentation**
   - Document new features
   - Add usage examples

## License

Part of the Social Media Poster application.
