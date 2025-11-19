import { Test, TestingModule } from '@nestjs/testing';
import { RedditService } from './reddit.service';
import { RedditApiClient } from './reddit-api.client';
import { RedditMediaService } from './reddit-media.service';
import { PostContent } from '../../common/interfaces';

describe('RedditService', () => {
  let service: RedditService;
  let apiClient: RedditApiClient;
  let mediaService: RedditMediaService;

  const mockApiClient = {
    isConfigured: jest.fn().mockReturnValue(true),
    authenticate: jest.fn().mockResolvedValue(undefined),
    createTextPost: jest.fn().mockResolvedValue({
      postId: 't3_abc123',
      url: 'https://reddit.com/r/test/comments/abc123/test_post/',
    }),
    createLinkPost: jest.fn().mockResolvedValue({
      postId: 't3_xyz789',
      url: 'https://reddit.com/r/technology/comments/xyz789/cool_link/',
    }),
    getDefaultSubreddit: jest.fn().mockReturnValue('test'),
  };

  const mockMediaService = {
    validateMedia: jest.fn().mockReturnValue({ valid: true }),
    uploadMedia: jest.fn().mockResolvedValue([
      {
        url: 'https://reddit-uploaded-media.s3.amazonaws.com/image.jpg',
        assetId: 'asset123',
      },
    ]),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedditService,
        {
          provide: RedditApiClient,
          useValue: mockApiClient,
        },
        {
          provide: RedditMediaService,
          useValue: mockMediaService,
        },
      ],
    }).compile();

    service = module.get<RedditService>(RedditService);
    apiClient = module.get<RedditApiClient>(RedditApiClient);
    mediaService = module.get<RedditMediaService>(RedditMediaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('isReady', () => {
    it('should return true when API client is configured', () => {
      expect(service.isReady()).toBe(true);
      expect(mockApiClient.isConfigured).toHaveBeenCalled();
    });

    it('should return false when API client is not configured', () => {
      mockApiClient.isConfigured.mockReturnValueOnce(false);
      expect(service.isReady()).toBe(false);
    });
  });

  describe('publishPost', () => {
    describe('validation', () => {
      it('should throw error if API is not configured', async () => {
        mockApiClient.isConfigured.mockReturnValueOnce(false);

        const content: PostContent = {
          text: 'Test post',
          metadata: {
            title: 'Test Title',
            subreddit: 'test',
          },
        };

        await expect(service.publishPost(content)).rejects.toThrow(
          'Reddit API is not properly configured',
        );
      });

      it('should throw error if subreddit is missing', async () => {
        const content: PostContent = {
          text: 'Test post',
          metadata: {
            title: 'Test Title',
          },
        };

        await expect(service.publishPost(content)).rejects.toThrow(
          'Subreddit is required',
        );
      });

      it('should throw error if title is missing', async () => {
        const content: PostContent = {
          text: 'Test post',
          metadata: {
            subreddit: 'test',
          },
        };

        await expect(service.publishPost(content)).rejects.toThrow(
          'Title is required',
        );
      });

      it('should throw error if text is missing', async () => {
        const content: PostContent = {
          text: '',
          metadata: {
            title: 'Test Title',
            subreddit: 'test',
          },
        };

        await expect(service.publishPost(content)).rejects.toThrow(
          'Post text is required',
        );
      });

      it('should throw error if title exceeds 300 characters', async () => {
        const longTitle = 'a'.repeat(301);

        const content: PostContent = {
          text: 'Test post',
          metadata: {
            title: longTitle,
            subreddit: 'test',
          },
        };

        await expect(service.publishPost(content)).rejects.toThrow(
          'exceeds 300 characters',
        );
      });

      it('should throw error if text exceeds 40000 characters', async () => {
        const longText = 'a'.repeat(40001);

        const content: PostContent = {
          text: longText,
          metadata: {
            title: 'Test Title',
            subreddit: 'test',
          },
        };

        await expect(service.publishPost(content)).rejects.toThrow(
          'exceeds 40000 characters',
        );
      });
    });

    describe('text posts', () => {
      it('should successfully publish a text-only post', async () => {
        const content: PostContent = {
          text: 'This is a test post',
          metadata: {
            title: 'Test Title',
            subreddit: 'test',
          },
        };

        const result = await service.publishPost(content);

        expect(result).toEqual({
          platformPostId: 't3_abc123',
          url: 'https://reddit.com/r/test/comments/abc123/test_post/',
        });

        expect(mockApiClient.authenticate).toHaveBeenCalled();
        expect(mockApiClient.createTextPost).toHaveBeenCalledWith(
          'test',
          'Test Title',
          'This is a test post',
        );
      });

      it('should use default subreddit if not provided', async () => {
        const content: PostContent = {
          text: 'Test post',
          metadata: {
            title: 'Test Title',
          },
        };

        await service.publishPost(content);

        expect(mockApiClient.createTextPost).toHaveBeenCalledWith(
          'test',
          'Test Title',
          'Test post',
        );
      });
    });

    describe('link posts', () => {
      it('should successfully publish a link post', async () => {
        const content: PostContent = {
          text: 'Check out this article',
          link: 'https://example.com/article',
          metadata: {
            title: 'Cool Article',
            subreddit: 'technology',
          },
        };

        const result = await service.publishPost(content);

        expect(result).toEqual({
          platformPostId: 't3_xyz789',
          url: 'https://reddit.com/r/technology/comments/xyz789/cool_link/',
        });

        expect(mockApiClient.createLinkPost).toHaveBeenCalledWith(
          'technology',
          'Cool Article',
          'https://example.com/article',
        );
      });
    });

    describe('media posts', () => {
      it('should handle posts with media attachments', async () => {
        const content: PostContent = {
          text: 'Check out this image!',
          media: [
            {
              url: 'https://example.com/image.jpg',
              type: 'image',
              alt: 'Cool image',
            },
          ],
          metadata: {
            title: 'Cool Image',
            subreddit: 'pics',
          },
        };

        await service.publishPost(content);

        expect(mockMediaService.validateMedia).toHaveBeenCalledWith(
          content.media,
        );
        expect(mockApiClient.createTextPost).toHaveBeenCalledWith(
          'pics',
          'Cool Image',
          expect.stringContaining('![Cool image]'),
        );
      });

      it('should throw error if media validation fails', async () => {
        mockMediaService.validateMedia.mockReturnValueOnce({
          valid: false,
          errors: ['Unsupported media type'],
        });

        const content: PostContent = {
          text: 'Test post',
          media: [
            {
              url: 'https://example.com/file.pdf',
              type: 'image',
            },
          ],
          metadata: {
            title: 'Test',
            subreddit: 'test',
          },
        };

        await expect(service.publishPost(content)).rejects.toThrow(
          'Media validation failed',
        );
      });
    });

    describe('error handling', () => {
      it('should handle API client errors', async () => {
        mockApiClient.createTextPost.mockRejectedValueOnce(
          new Error('API Error'),
        );

        const content: PostContent = {
          text: 'Test post',
          metadata: {
            title: 'Test Title',
            subreddit: 'test',
          },
        };

        await expect(service.publishPost(content)).rejects.toThrow(
          'Reddit posting failed',
        );
      });

      it('should handle authentication errors', async () => {
        mockApiClient.authenticate.mockRejectedValueOnce(
          new Error('Auth failed'),
        );

        const content: PostContent = {
          text: 'Test post',
          metadata: {
            title: 'Test Title',
            subreddit: 'test',
          },
        };

        await expect(service.publishPost(content)).rejects.toThrow(
          'Reddit posting failed',
        );
      });
    });
  });
});
