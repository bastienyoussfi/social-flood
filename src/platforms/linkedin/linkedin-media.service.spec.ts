import { Test, TestingModule } from '@nestjs/testing';
import { LinkedInMediaService } from './linkedin-media.service';
import { LinkedInApiClient } from './linkedin-api.client';
import { LinkedInOAuthService } from '../../auth/services/linkedin-oauth.service';
import { MediaAttachment } from '../../common/interfaces';

describe('LinkedInMediaService', () => {
  let service: LinkedInMediaService;

  const mockApiClient = {
    getBaseUrl: jest.fn().mockReturnValue('https://api.linkedin.com'),
    getAccessToken: jest.fn().mockReturnValue('test-access-token'),
    getPersonUrn: jest.fn().mockReturnValue('urn:li:person:123456'),
  };

  const mockOAuthService = {
    getAccessToken: jest.fn(),
    getPersonUrn: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LinkedInMediaService,
        {
          provide: LinkedInApiClient,
          useValue: mockApiClient,
        },
        {
          provide: LinkedInOAuthService,
          useValue: mockOAuthService,
        },
      ],
    }).compile();

    service = module.get<LinkedInMediaService>(LinkedInMediaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('uploadMedia', () => {
    it('should return empty array for no media', async () => {
      const result = await service.uploadMedia([]);
      expect(result).toEqual([]);
    });

    it('should throw error if media count exceeds maximum', async () => {
      const media: MediaAttachment[] = Array(21)
        .fill(null)
        .map((_, i) => ({
          url: `https://example.com/image${i}.jpg`,
          type: 'image' as const,
        }));

      await expect(service.uploadMedia(media)).rejects.toThrow(
        'LinkedIn supports maximum 20 images per post',
      );
    });

    it('should upload media successfully', async () => {
      const mockInitResponse = {
        value: {
          uploadUrl: 'https://upload.linkedin.com/test',
          image: 'urn:li:image:123',
        },
      };

      const mockImageBuffer = Buffer.from('fake-image-data');

      global.fetch = jest
        .fn()
        .mockImplementationOnce(() =>
          Promise.resolve({
            ok: true,
            json: jest.fn().mockResolvedValue(mockInitResponse),
          }),
        )
        .mockImplementationOnce(() =>
          Promise.resolve({
            ok: true,
            arrayBuffer: jest.fn().mockResolvedValue(mockImageBuffer.buffer),
            headers: {
              get: jest.fn().mockReturnValue('image/jpeg'),
            },
          }),
        )
        .mockImplementationOnce(() =>
          Promise.resolve({
            ok: true,
          }),
        );

      const media: MediaAttachment[] = [
        {
          url: 'https://example.com/image.jpg',
          type: 'image',
        },
      ];

      const result = await service.uploadMedia(media);

      expect(result).toEqual(['urn:li:image:123']);
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it('should skip non-image media types', async () => {
      const media: MediaAttachment[] = [
        {
          url: 'https://example.com/video.mp4',
          type: 'video',
        },
      ];

      await expect(service.uploadMedia(media)).rejects.toThrow(
        'Failed to upload any media attachments',
      );
    });

    it('should continue on individual upload failure', async () => {
      const mockInitResponse = {
        value: {
          uploadUrl: 'https://upload.linkedin.com/test',
          image: 'urn:li:image:123',
        },
      };

      const mockImageBuffer = Buffer.from('fake-image-data');

      global.fetch = jest
        .fn()
        // First image - fails
        .mockImplementationOnce(() =>
          Promise.reject(new Error('Network error')),
        )
        // Second image - succeeds
        .mockImplementationOnce(() =>
          Promise.resolve({
            ok: true,
            json: jest.fn().mockResolvedValue(mockInitResponse),
          }),
        )
        .mockImplementationOnce(() =>
          Promise.resolve({
            ok: true,
            arrayBuffer: jest.fn().mockResolvedValue(mockImageBuffer.buffer),
            headers: {
              get: jest.fn().mockReturnValue('image/jpeg'),
            },
          }),
        )
        .mockImplementationOnce(() =>
          Promise.resolve({
            ok: true,
          }),
        );

      const media: MediaAttachment[] = [
        {
          url: 'https://example.com/image1.jpg',
          type: 'image',
        },
        {
          url: 'https://example.com/image2.jpg',
          type: 'image',
        },
      ];

      const result = await service.uploadMedia(media);

      expect(result).toEqual(['urn:li:image:123']);
    });
  });

  describe('validateMedia', () => {
    it('should return valid for empty media', () => {
      const result = service.validateMedia([]);
      expect(result).toEqual({ valid: true, errors: [] });
    });

    it('should validate media count', () => {
      const media: MediaAttachment[] = Array(21)
        .fill(null)
        .map((_, i) => ({
          url: `https://example.com/image${i}.jpg`,
          type: 'image' as const,
        }));

      const result = service.validateMedia(media);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Too many images. LinkedIn supports maximum 20 images per post.',
      );
    });

    it('should validate missing URL', () => {
      const media: MediaAttachment[] = [
        {
          url: '',
          type: 'image',
        },
      ];

      const result = service.validateMedia(media);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Media item 1 is missing URL');
    });

    it('should validate unsupported type', () => {
      const media: MediaAttachment[] = [
        {
          url: 'https://example.com/video.mp4',
          type: 'video',
        },
      ];

      const result = service.validateMedia(media);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('unsupported type: video');
    });

    it('should validate invalid URL format', () => {
      const media: MediaAttachment[] = [
        {
          url: 'invalid-url',
          type: 'image',
        },
      ];

      const result = service.validateMedia(media);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('invalid URL');
    });

    it('should return valid for correct media', () => {
      const media: MediaAttachment[] = [
        {
          url: 'https://example.com/image.jpg',
          type: 'image',
        },
      ];

      const result = service.validateMedia(media);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });
});
