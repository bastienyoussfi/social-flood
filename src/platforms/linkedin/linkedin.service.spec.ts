import { Test, TestingModule } from '@nestjs/testing';
import { LinkedInService } from './linkedin.service';
import { LinkedInApiClient } from './linkedin-api.client';
import { LinkedInMediaService } from './linkedin-media.service';
import { PostContent } from '../../common/interfaces';

describe('LinkedInService', () => {
  let service: LinkedInService;
  let apiClient: LinkedInApiClient;
  let mediaService: LinkedInMediaService;

  const mockApiClient = {
    isConfigured: jest.fn().mockReturnValue(true),
    createPost: jest.fn().mockResolvedValue({
      postId: '7890',
      url: 'https://www.linkedin.com/feed/update/urn:li:share:7890',
      urn: 'urn:li:share:7890',
    }),
  };

  const mockMediaService = {
    validateMedia: jest.fn().mockReturnValue({ valid: true, errors: [] }),
    uploadMedia: jest
      .fn()
      .mockResolvedValue(['urn:li:image:123', 'urn:li:image:456']),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LinkedInService,
        {
          provide: LinkedInApiClient,
          useValue: mockApiClient,
        },
        {
          provide: LinkedInMediaService,
          useValue: mockMediaService,
        },
      ],
    }).compile();

    service = module.get<LinkedInService>(LinkedInService);
    apiClient = module.get<LinkedInApiClient>(LinkedInApiClient);
    mediaService = module.get<LinkedInMediaService>(LinkedInMediaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    // Reset mocks to default values
    mockApiClient.isConfigured.mockReturnValue(true);
    mockMediaService.validateMedia.mockReturnValue({ valid: true, errors: [] });
    mockMediaService.uploadMedia.mockResolvedValue([
      'urn:li:image:123',
      'urn:li:image:456',
    ]);
    mockApiClient.createPost.mockResolvedValue({
      postId: '7890',
      url: 'https://www.linkedin.com/feed/update/urn:li:share:7890',
      urn: 'urn:li:share:7890',
    });
  });

  describe('initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should check if service is ready', () => {
      const isConfiguredSpy = jest.spyOn(apiClient, 'isConfigured');
      expect(service.isReady()).toBe(true);
      expect(isConfiguredSpy).toHaveBeenCalled();
    });
  });

  describe('publishPost', () => {
    it('should publish a text-only post successfully', async () => {
      const content: PostContent = {
        text: 'Test LinkedIn post',
      };

      const result = await service.publishPost(content);

      expect(result).toEqual({
        platformPostId: '7890',
        url: 'https://www.linkedin.com/feed/update/urn:li:share:7890',
      });

      const createPostSpy = jest.spyOn(apiClient, 'createPost');
      expect(createPostSpy).toHaveBeenCalledWith(
        'Test LinkedIn post',
        undefined,
      );
    });

    it('should publish a post with media', async () => {
      const content: PostContent = {
        text: 'Test LinkedIn post with images',
        media: [
          {
            url: 'https://example.com/image1.jpg',
            type: 'image',
          },
          {
            url: 'https://example.com/image2.jpg',
            type: 'image',
          },
        ],
      };

      const result = await service.publishPost(content);

      const validateMediaSpy = jest.spyOn(mediaService, 'validateMedia');
      const uploadMediaSpy = jest.spyOn(mediaService, 'uploadMedia');
      const createPostSpy = jest.spyOn(apiClient, 'createPost');

      expect(validateMediaSpy).toHaveBeenCalledWith(content.media);
      expect(uploadMediaSpy).toHaveBeenCalledWith(content.media);
      expect(createPostSpy).toHaveBeenCalledWith(
        'Test LinkedIn post with images',
        ['urn:li:image:123', 'urn:li:image:456'],
      );

      expect(result).toEqual({
        platformPostId: '7890',
        url: 'https://www.linkedin.com/feed/update/urn:li:share:7890',
      });
    });

    it('should append link to post text', async () => {
      const content: PostContent = {
        text: 'Check out this link',
        link: 'https://example.com/article',
      };

      await service.publishPost(content);

      const createPostSpy = jest.spyOn(apiClient, 'createPost');
      expect(createPostSpy).toHaveBeenCalledWith(
        'Check out this link\n\nhttps://example.com/article',
        undefined,
      );
    });

    it('should throw error if not configured', async () => {
      mockApiClient.isConfigured.mockReturnValue(false);

      const content: PostContent = {
        text: 'Test post',
      };

      await expect(service.publishPost(content)).rejects.toThrow(
        'LinkedIn API is not properly configured',
      );
    });

    it('should throw error if text is empty', async () => {
      const content: PostContent = {
        text: '',
      };

      await expect(service.publishPost(content)).rejects.toThrow(
        'Post text is required',
      );
    });

    it('should throw error if text exceeds character limit', async () => {
      const content: PostContent = {
        text: 'a'.repeat(3001),
      };

      await expect(service.publishPost(content)).rejects.toThrow(
        'Post text exceeds 3000 characters',
      );
    });

    it('should throw error if media validation fails', async () => {
      mockMediaService.validateMedia.mockReturnValue({
        valid: false,
        errors: ['Too many images'],
      });

      const content: PostContent = {
        text: 'Test post',
        media: [
          {
            url: 'https://example.com/image.jpg',
            type: 'image',
          },
        ],
      };

      await expect(service.publishPost(content)).rejects.toThrow(
        'Media validation failed: Too many images',
      );
    });

    it('should handle API client errors gracefully', async () => {
      mockApiClient.createPost.mockRejectedValue(
        new Error('API rate limit exceeded'),
      );

      const content: PostContent = {
        text: 'Test post',
      };

      await expect(service.publishPost(content)).rejects.toThrow(
        'LinkedIn posting failed: API rate limit exceeded',
      );
    });

    it('should handle media upload errors gracefully', async () => {
      mockMediaService.uploadMedia.mockRejectedValue(
        new Error('Failed to download image'),
      );

      const content: PostContent = {
        text: 'Test post',
        media: [
          {
            url: 'https://example.com/image.jpg',
            type: 'image',
          },
        ],
      };

      await expect(service.publishPost(content)).rejects.toThrow(
        'LinkedIn posting failed: Failed to download image',
      );
    });
  });
});
