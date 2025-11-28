import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { LinkedInApiClient } from './linkedin-api.client';
import { LinkedInOAuthService } from '../../auth/services/linkedin-oauth.service';
import {
  LinkedInVisibility,
  LinkedInDistributionFeed,
  LinkedInLifecycleState,
} from './interfaces';

type MockConfig = {
  LINKEDIN_CLIENT_ID: string;
  LINKEDIN_CLIENT_SECRET: string;
  LINKEDIN_ACCESS_TOKEN: string;
  LINKEDIN_PERSON_URN: string;
  [key: string]: string | undefined;
};

describe('LinkedInApiClient', () => {
  let client: LinkedInApiClient;
  let configService: ConfigService;

  const mockConfig: MockConfig = {
    LINKEDIN_CLIENT_ID: 'test-client-id',
    LINKEDIN_CLIENT_SECRET: 'test-client-secret',
    LINKEDIN_ACCESS_TOKEN: 'test-access-token',
    LINKEDIN_PERSON_URN: 'urn:li:person:123456',
  };

  const mockOAuthService = {
    getAccessToken: jest.fn(),
    getPersonUrn: jest.fn(),
    hasValidToken: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LinkedInApiClient,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => mockConfig[key]),
          },
        },
        {
          provide: LinkedInOAuthService,
          useValue: mockOAuthService,
        },
      ],
    }).compile();

    client = module.get<LinkedInApiClient>(LinkedInApiClient);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should be defined', () => {
      expect(client).toBeDefined();
    });

    it('should load configuration from environment', () => {
      const getSpy = jest.spyOn(configService, 'get');
      expect(getSpy).toHaveBeenCalledWith('LINKEDIN_CLIENT_ID');
      expect(getSpy).toHaveBeenCalledWith('LINKEDIN_CLIENT_SECRET');
      expect(getSpy).toHaveBeenCalledWith('LINKEDIN_ACCESS_TOKEN');
      expect(getSpy).toHaveBeenCalledWith('LINKEDIN_PERSON_URN');
    });

    it('should throw error if client credentials are missing', () => {
      const invalidConfigService = {
        get: jest.fn((key: string): string | undefined => {
          if (key === 'LINKEDIN_CLIENT_ID') return '';
          return mockConfig[key];
        }),
      };

      expect(() => {
        new LinkedInApiClient(
          invalidConfigService as unknown as ConfigService,
          mockOAuthService as unknown as LinkedInOAuthService,
        );
      }).toThrow('LinkedIn OAuth credentials are not properly configured');
    });

    it('should check if client is properly configured', () => {
      expect(client.isConfigured()).toBe(true);
    });
  });

  describe('createPost', () => {
    type MockResponse = {
      headers: {
        get: (header: string) => string | null;
      };
      ok: boolean;
      status?: number;
      json: () => Promise<unknown>;
    };

    const mockPostResponse: MockResponse = {
      headers: {
        get: (header: string): string | null => {
          if (header === 'x-restli-id') {
            return 'urn:li:share:7890';
          }
          return null;
        },
      },
      ok: true,
      json: jest.fn().mockResolvedValue({}),
    };

    let fetchMock: jest.Mock;

    beforeEach(() => {
      fetchMock = jest.fn().mockResolvedValue(mockPostResponse);
      global.fetch = fetchMock as unknown as typeof fetch;
    });

    it('should create a post successfully', async () => {
      const result = await client.createPost('Test post content');

      expect(result).toEqual({
        postId: '7890',
        url: 'https://www.linkedin.com/feed/update/urn:li:share:7890',
        urn: 'urn:li:share:7890',
      });

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.linkedin.com/rest/posts',
        expect.objectContaining({
          method: 'POST',
        }),
      );

      const callArgs = fetchMock.mock.calls[0] as [
        string,
        { headers: Record<string, string>; [key: string]: unknown },
      ];
      expect(callArgs[1].headers).toMatchObject({
        Authorization: 'Bearer test-access-token',
        'LinkedIn-Version': '202510',
        'X-Restli-Protocol-Version': '2.0.0',
        'Content-Type': 'application/json',
      });
    });

    it('should create a post with single media', async () => {
      await client.createPost('Test post', ['urn:li:image:123']);

      const callArgs = fetchMock.mock.calls[0] as [
        string,
        { body: string; [key: string]: unknown },
      ];
      const body = JSON.parse(callArgs[1].body) as Record<string, unknown>;

      expect(body).toMatchObject({
        author: 'urn:li:person:123456',
        commentary: 'Test post',
        visibility: LinkedInVisibility.PUBLIC,
        distribution: {
          feedDistribution: LinkedInDistributionFeed.MAIN_FEED,
        },
        lifecycleState: LinkedInLifecycleState.PUBLISHED,
        content: {
          media: {
            id: 'urn:li:image:123',
          },
        },
      });
    });

    it('should create a post with multiple media', async () => {
      await client.createPost('Test post', [
        'urn:li:image:123',
        'urn:li:image:456',
      ]);

      const callArgs = fetchMock.mock.calls[0] as [
        string,
        { body: string; [key: string]: unknown },
      ];
      const body = JSON.parse(callArgs[1].body) as {
        content: Record<string, unknown>;
      };

      expect(body.content).toMatchObject({
        multiImage: {
          images: [{ id: 'urn:li:image:123' }, { id: 'urn:li:image:456' }],
        },
      });
    });

    it('should throw error if access token is missing', async () => {
      const noTokenConfigService = {
        get: jest.fn((key: string): string | undefined => {
          if (key === 'LINKEDIN_ACCESS_TOKEN') return undefined;
          return mockConfig[key];
        }),
      };

      const noTokenClient = new LinkedInApiClient(
        noTokenConfigService as unknown as ConfigService,
        mockOAuthService as unknown as LinkedInOAuthService,
      );

      await expect(noTokenClient.createPost('Test')).rejects.toThrow(
        'LinkedIn access token is not configured',
      );
    });

    it('should throw error if person URN is missing', async () => {
      const noUrnConfigService = {
        get: jest.fn((key: string): string | undefined => {
          if (key === 'LINKEDIN_PERSON_URN') return undefined;
          return mockConfig[key];
        }),
      };

      const noUrnClient = new LinkedInApiClient(
        noUrnConfigService as unknown as ConfigService,
        mockOAuthService as unknown as LinkedInOAuthService,
      );

      await expect(noUrnClient.createPost('Test')).rejects.toThrow(
        'LinkedIn person URN is not configured',
      );
    });

    it('should handle API errors', async () => {
      const errorResponse: MockResponse = {
        ok: false,
        status: 400,
        headers: {
          get: (): null => null,
        },
        json: jest.fn().mockResolvedValue({
          status: 400,
          message: 'Invalid request',
        }),
      };

      fetchMock.mockResolvedValue(errorResponse);

      await expect(client.createPost('Test')).rejects.toThrow(
        'LinkedIn API validation error',
      );
    });

    it('should handle rate limit errors', async () => {
      const errorResponse: MockResponse = {
        ok: false,
        status: 429,
        headers: {
          get: (): null => null,
        },
        json: jest.fn().mockResolvedValue({
          status: 429,
          message: 'Rate limit exceeded',
        }),
      };

      fetchMock.mockResolvedValue(errorResponse);

      await expect(client.createPost('Test')).rejects.toThrow(
        'LinkedIn rate limit exceeded',
      );
    });

    it('should handle authentication errors', async () => {
      const errorResponse: MockResponse = {
        ok: false,
        status: 401,
        headers: {
          get: (): null => null,
        },
        json: jest.fn().mockResolvedValue({
          status: 401,
          message: 'Unauthorized',
        }),
      };

      fetchMock.mockResolvedValue(errorResponse);

      await expect(client.createPost('Test')).rejects.toThrow(
        'LinkedIn authentication failed',
      );
    });
  });

  describe('helper methods', () => {
    it('should return base URL', () => {
      expect(client.getBaseUrl()).toBe('https://api.linkedin.com');
    });

    it('should return access token', () => {
      expect(client.getAccessToken()).toBe('test-access-token');
    });

    it('should return person URN', () => {
      expect(client.getPersonUrn()).toBe('urn:li:person:123456');
    });
  });
});
