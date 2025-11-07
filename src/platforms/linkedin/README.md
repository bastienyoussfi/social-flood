# LinkedIn Module

A comprehensive LinkedIn integration module for posting content via the LinkedIn REST API v2. This module follows the same architectural patterns as the Twitter module for consistency and maintainability.

## 📋 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Features](#features)
- [Configuration](#configuration)
- [Usage](#usage)
- [API Reference](#api-reference)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)

## 🎯 Overview

The LinkedIn module provides a complete integration with LinkedIn's REST API v2 (2025), enabling your application to:
- Post text content to LinkedIn
- Upload and attach images (1-20 per post)
- Handle media downloads from external URLs
- Track job status and update database records
- Handle errors gracefully with retry logic

## 🏗️ Architecture

The module follows a layered architecture with clear separation of concerns:

```
┌─────────────────────────────────────────────────────┐
│                  LinkedIn Module                     │
├─────────────────────────────────────────────────────┤
│                                                      │
│  ┌──────────────┐         ┌──────────────┐         │
│  │   Adapter    │────────▶│  Processor   │         │
│  │  (Queue)     │         │  (Jobs)      │         │
│  └──────────────┘         └──────────────┘         │
│         │                        │                  │
│         ▼                        ▼                  │
│  ┌──────────────────────────────────────┐          │
│  │            Service Layer              │          │
│  │    (Orchestration & Validation)       │          │
│  └──────────────────────────────────────┘          │
│         │                        │                  │
│         ▼                        ▼                  │
│  ┌──────────────┐         ┌──────────────┐         │
│  │  API Client  │         │Media Service │         │
│  │ (REST API v2)│         │  (Upload)    │         │
│  └──────────────┘         └──────────────┘         │
│         │                        │                  │
│         └────────┬───────────────┘                  │
│                  ▼                                   │
│          LinkedIn API v2                            │
└─────────────────────────────────────────────────────┘
```

### Components

#### 1. **LinkedInAdapter** (`linkedin.adapter.ts`)
- Queue interface for posting
- Content validation
- Job status tracking
- **Max character limit**: 3,000 characters

#### 2. **LinkedInProcessor** (`linkedin.processor.ts`)
- Processes jobs from the Bull queue
- Delegates to LinkedInService
- Error handling and logging

#### 3. **LinkedInService** (`linkedin.service.ts`)
- Orchestrates posting workflow
- Coordinates between API client and media service
- Validates content and configuration

#### 4. **LinkedInApiClient** (`linkedin-api.client.ts`)
- Direct communication with LinkedIn REST API v2
- OAuth 2.0 authentication
- Post creation with text and media
- Error handling for specific API codes

#### 5. **LinkedInMediaService** (`linkedin-media.service.ts`)
- 3-step media upload process:
  1. Initialize upload (get upload URL and URN)
  2. Download media from external URL
  3. Upload binary to LinkedIn
- **Supports**: 1-20 images per post
- **Max size**: 5MB per image
- **Formats**: JPEG, PNG, GIF

#### 6. **LinkedInQueueService** (`linkedin-queue.service.ts`)
- Listens to queue events
- Updates database records
- Tracks post status

## ✨ Features

### Core Functionality
- ✅ Text-only posts
- ✅ Posts with single image
- ✅ Posts with multiple images (2-20)
- ✅ Link attachment with auto-expansion
- ✅ Alt text support for images
- ✅ Character limit validation (3,000)

### Technical Features
- ✅ OAuth 2.0 authentication
- ✅ Rate limit handling
- ✅ Retry logic (3 attempts with exponential backoff)
- ✅ Comprehensive error messages
- ✅ Database integration
- ✅ Job queue management
- ✅ Full TypeScript type safety
- ✅ 51 unit tests

### Error Handling
- ✅ Rate limit errors (429)
- ✅ Authentication errors (401/403)
- ✅ Validation errors (400)
- ✅ Network errors
- ✅ Media upload failures

## ⚙️ Configuration

### Required Environment Variables

Add these to your `.env` file:

```env
# LinkedIn OAuth 2.0 Credentials
LINKEDIN_CLIENT_ID=your_client_id_here
LINKEDIN_CLIENT_SECRET=your_client_secret_here

# LinkedIn Access Token (OAuth 2.0)
LINKEDIN_ACCESS_TOKEN=your_access_token_here

# LinkedIn Person URN
LINKEDIN_PERSON_URN=urn:li:person:your_person_id
```

### Getting LinkedIn Credentials

1. **Create a LinkedIn App**
   - Go to [LinkedIn Developers](https://www.linkedin.com/developers/apps)
   - Create a new app
   - Note your Client ID and Client Secret

2. **Get Access Token**
   - Implement OAuth 2.0 authorization flow
   - Request scopes: `w_member_social`, `r_liteprofile`
   - Exchange authorization code for access token
   - **Token expires in**: 60 days

3. **Get Person URN**
   - After authentication, call: `GET https://api.linkedin.com/v2/me`
   - Extract ID from response: `urn:li:person:{id}`

### OAuth 2.0 Flow

```bash
# 1. Authorization URL
https://www.linkedin.com/oauth/v2/authorization?
  response_type=code&
  client_id={CLIENT_ID}&
  redirect_uri={REDIRECT_URI}&
  scope=w_member_social%20r_liteprofile

# 2. Exchange code for token
POST https://www.linkedin.com/oauth/v2/accessToken
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code&
code={AUTHORIZATION_CODE}&
client_id={CLIENT_ID}&
client_secret={CLIENT_SECRET}&
redirect_uri={REDIRECT_URI}
```

## 🚀 Usage

### Basic Text Post

```typescript
import { Injectable } from '@nestjs/common';
import { LinkedInAdapter } from './platforms/linkedin/linkedin.adapter';

@Injectable()
export class MyService {
  constructor(private readonly linkedInAdapter: LinkedInAdapter) {}

  async postToLinkedIn() {
    const result = await this.linkedInAdapter.post({
      text: 'Hello LinkedIn! This is my first automated post.',
    });

    console.log('Job ID:', result.jobId);
    console.log('Status:', result.status);
  }
}
```

### Post with Images

```typescript
async postWithImages() {
  const result = await this.linkedInAdapter.post({
    text: 'Check out these amazing images!',
    media: [
      {
        url: 'https://example.com/image1.jpg',
        type: 'image',
        alt: 'Description of first image',
      },
      {
        url: 'https://example.com/image2.jpg',
        type: 'image',
        alt: 'Description of second image',
      },
    ],
  });

  return result;
}
```

### Post with Link

```typescript
async postWithLink() {
  const result = await this.linkedInAdapter.post({
    text: 'Read my latest article about software architecture!',
    link: 'https://example.com/my-article',
  });

  return result;
}
```

### Check Post Status

```typescript
async checkStatus(jobId: string) {
  const status = await this.linkedInAdapter.getPostStatus(jobId);

  console.log('Status:', status.status);
  console.log('LinkedIn Post ID:', status.platformPostId);
  console.log('LinkedIn URL:', status.url);
  console.log('Error:', status.error);

  return status;
}
```

### Using the Service Directly

```typescript
import { LinkedInService } from './platforms/linkedin/linkedin.service';

@Injectable()
export class MyService {
  constructor(private readonly linkedInService: LinkedInService) {}

  async post() {
    try {
      const result = await this.linkedInService.publishPost({
        text: 'Direct service call example',
        media: [
          { url: 'https://example.com/image.jpg', type: 'image' },
        ],
      });

      console.log('Post ID:', result.platformPostId);
      console.log('URL:', result.url);
    } catch (error) {
      console.error('Failed to post:', error.message);
    }
  }
}
```

## 📚 API Reference

### Interfaces

#### PostContent
```typescript
interface PostContent {
  text: string;              // Required, max 3000 characters
  media?: MediaAttachment[]; // Optional, 1-20 images
  link?: string;             // Optional, auto-expanded
  metadata?: Record<string, unknown>; // Optional metadata
}
```

#### MediaAttachment
```typescript
interface MediaAttachment {
  url: string;      // URL to download image from
  type: 'image';    // Only 'image' supported currently
  alt?: string;     // Optional alt text for accessibility
}
```

#### PostResult
```typescript
interface PostResult {
  jobId: string;           // Bull queue job ID
  platformPostId?: string; // LinkedIn post ID (when completed)
  status: PostStatus;      // 'queued' | 'posted' | 'failed'
  platform: Platform;      // 'linkedin'
  error?: string;          // Error message if failed
  url?: string;            // LinkedIn post URL (when completed)
}
```

### LinkedIn API Response Types

#### LinkedInPostResponse
```typescript
interface LinkedInPostResponse {
  id: string; // URN format: urn:li:share:{id}
}
```

#### LinkedInImageUploadInit
```typescript
interface LinkedInImageUploadInit {
  value: {
    uploadUrl: string; // Pre-signed URL for binary upload
    image: string;     // URN format: urn:li:image:{id}
  };
}
```

### Enums

#### LinkedInVisibility
```typescript
enum LinkedInVisibility {
  PUBLIC = 'PUBLIC',         // Visible to everyone
  CONNECTIONS = 'CONNECTIONS' // Visible to connections only
}
```

#### LinkedInDistributionFeed
```typescript
enum LinkedInDistributionFeed {
  MAIN_FEED = 'MAIN_FEED', // Appears in main feed
  NONE = 'NONE'            // Does not appear in feed
}
```

#### LinkedInLifecycleState
```typescript
enum LinkedInLifecycleState {
  PUBLISHED = 'PUBLISHED', // Post is published
  DRAFT = 'DRAFT'          // Post is draft
}
```

## 🧪 Testing

The module includes comprehensive test coverage with 51 passing tests.

### Run Tests

```bash
# Run all LinkedIn tests
npm test -- linkedin

# Run specific test file
npm test -- linkedin.service.spec.ts

# Run with coverage
npm test -- --coverage linkedin
```

### Test Structure

```
src/platforms/linkedin/
├── linkedin-api.client.spec.ts    # API client tests (18 tests)
├── linkedin-media.service.spec.ts # Media service tests (8 tests)
├── linkedin.service.spec.ts       # Service layer tests (13 tests)
└── linkedin.adapter.spec.ts       # Adapter tests (12 tests)
```

### Example Test

```typescript
it('should create a post with multiple media', async () => {
  await client.createPost('Test post', [
    'urn:li:image:123',
    'urn:li:image:456',
  ]);

  expect(body.content).toMatchObject({
    multiImage: {
      images: [
        { id: 'urn:li:image:123' },
        { id: 'urn:li:image:456' }
      ],
    },
  });
});
```

## 🔧 Troubleshooting

### Common Issues

#### 1. "LinkedIn OAuth credentials are not properly configured"

**Cause**: Missing or invalid `LINKEDIN_CLIENT_ID` or `LINKEDIN_CLIENT_SECRET`

**Solution**:
```bash
# Check your .env file
LINKEDIN_CLIENT_ID=your_client_id
LINKEDIN_CLIENT_SECRET=your_client_secret
```

#### 2. "LinkedIn access token is not configured"

**Cause**: Missing or expired `LINKEDIN_ACCESS_TOKEN`

**Solution**:
- Implement OAuth 2.0 flow to get a new access token
- LinkedIn access tokens expire after 60 days
- Set `LINKEDIN_ACCESS_TOKEN` in your `.env` file

#### 3. "LinkedIn person URN is not configured"

**Cause**: Missing `LINKEDIN_PERSON_URN`

**Solution**:
```bash
# Get your person URN
curl -X GET 'https://api.linkedin.com/v2/me' \
  -H 'Authorization: Bearer {ACCESS_TOKEN}'

# Add to .env
LINKEDIN_PERSON_URN=urn:li:person:your_id
```

#### 4. "LinkedIn rate limit exceeded"

**Cause**: Too many API requests (HTTP 429)

**Solution**:
- Wait before retrying (LinkedIn enforces rate limits)
- Implement exponential backoff (already built-in)
- Check LinkedIn API rate limits documentation

#### 5. "LinkedIn authentication failed"

**Cause**: Invalid or expired access token (HTTP 401/403)

**Solution**:
- Refresh your access token using OAuth 2.0 refresh flow
- Verify token has required scopes: `w_member_social`
- Check token expiration

#### 6. "Image exceeds maximum size of 5MB"

**Cause**: Image file is too large

**Solution**:
- Compress images before uploading
- Use image optimization tools
- Maximum supported size: 5MB per image

#### 7. "Too many images. LinkedIn supports maximum 20 images"

**Cause**: Trying to upload more than 20 images

**Solution**:
- Limit to 20 images per post
- Split into multiple posts if needed

### Debug Mode

Enable detailed logging:

```typescript
// In your application
import { Logger } from '@nestjs/common';

const logger = new Logger('LinkedIn');
logger.debug('Detailed debug information');
```

### Check Service Health

```typescript
async checkHealth() {
  const isReady = this.linkedInService.isReady();

  if (!isReady) {
    console.error('LinkedIn service is not properly configured');
  }

  return { linkedin: isReady ? 'healthy' : 'unhealthy' };
}
```

## 📖 Additional Resources

- [LinkedIn REST API Documentation](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api?view=li-lms-2025-10)
- [LinkedIn OAuth 2.0 Guide](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow)
- [LinkedIn Image API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/images-api?view=li-lms-2025-10)
- [LinkedIn Developer Portal](https://www.linkedin.com/developers/)

## 🤝 Contributing

When contributing to this module:

1. Follow the existing code patterns from Twitter module
2. Maintain DRY principles
3. Add comprehensive tests for new features
4. Update this README with new functionality
5. Ensure all linting and formatting checks pass

## 📝 License

This module is part of the social-flood application. See the main project LICENSE file for details.

---

**Version**: 1.0.0
**Last Updated**: 2025-11-07
**LinkedIn API Version**: 202510
