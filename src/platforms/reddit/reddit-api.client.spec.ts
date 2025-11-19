import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RedditApiClient } from './reddit-api.client';

type MockConfig = {
  REDDIT_CLIENT_ID: string;
  REDDIT_CLIENT_SECRET: string;
  REDDIT_USER_AGENT: string;
  REDDIT_DEFAULT_SUBREDDIT?: string;
  [key: string]: string | undefined;
};

describe('RedditApiClient', () => {
  let client: RedditApiClient;
  let configService: ConfigService;

  const mockConfig: MockConfig = {
    REDDIT_CLIENT_ID: 'test-client-id',
    REDDIT_CLIENT_SECRET: 'test-client-secret',
    REDDIT_USER_AGENT: 'social-flood/1.0.0 (by /u/testuser)',
    REDDIT_DEFAULT_SUBREDDIT: 'test',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedditApiClient,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => mockConfig[key]),
          },
        },
      ],
    }).compile();

    client = module.get<RedditApiClient>(RedditApiClient);
    configService = module.get<ConfigService>(ConfigService);

    // Mock global fetch
    global.fetch = jest.fn();
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
      expect(getSpy).toHaveBeenCalledWith('REDDIT_CLIENT_ID');
      expect(getSpy).toHaveBeenCalledWith('REDDIT_CLIENT_SECRET');
      expect(getSpy).toHaveBeenCalledWith('REDDIT_USER_AGENT');
      expect(getSpy).toHaveBeenCalledWith('REDDIT_DEFAULT_SUBREDDIT');
    });
  });

  describe('isConfigured', () => {
    it('should return true when all required config is present', () => {
      expect(client.isConfigured()).toBe(true);
    });

    it('should return false when client ID is missing', () => {
      const invalidConfigService = {
        get: jest.fn((key: string): string | undefined => {
          if (key === 'REDDIT_CLIENT_ID') return '';
          return mockConfig[key];
        }),
      };

      const invalidClient = new RedditApiClient(
        invalidConfigService as unknown as ConfigService,
      );
      expect(invalidClient.isConfigured()).toBe(false);
    });

    it('should return false when client secret is missing', () => {
      const invalidConfigService = {
        get: jest.fn((key: string): string | undefined => {
          if (key === 'REDDIT_CLIENT_SECRET') return '';
          return mockConfig[key];
        }),
      };

      const invalidClient = new RedditApiClient(
        invalidConfigService as unknown as ConfigService,
      );
      expect(invalidClient.isConfigured()).toBe(false);
    });

    it('should return false when user agent is missing', () => {
      const invalidConfigService = {
        get: jest.fn((key: string): string | undefined => {
          if (key === 'REDDIT_USER_AGENT') return '';
          return mockConfig[key];
        }),
      };

      const invalidClient = new RedditApiClient(
        invalidConfigService as unknown as ConfigService,
      );
      expect(invalidClient.isConfigured()).toBe(false);
    });
  });

  describe('authenticate', () => {
    it('should successfully authenticate and store token', async () => {
      const mockTokenResponse = {
        access_token: 'test-access-token',
        token_type: 'bearer',
        expires_in: 3600,
        scope: '*',
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockTokenResponse,
      });

      await client.authenticate();

      expect(global.fetch).toHaveBeenCalledWith(
        'https://www.reddit.com/api/v1/access_token',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': expect.stringContaining('Basic'),
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': mockConfig.REDDIT_USER_AGENT,
          }),
          body: 'grant_type=client_credentials',
        }),
      );
    });

    it('should throw error when authentication fails', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      });

      await expect(client.authenticate()).rejects.toThrow(
        'Reddit authentication failed',
      );
    });

    it('should include correct Basic Auth header', async () => {
      const mockTokenResponse = {
        access_token: 'test-token',
        token_type: 'bearer',
        expires_in: 3600,
        scope: '*',
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockTokenResponse,
      });

      await client.authenticate();

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const authHeader = fetchCall[1].headers.Authorization;

      // Verify it's Base64 encoded client_id:client_secret
      expect(authHeader).toContain('Basic');
      const encodedCreds = authHeader.replace('Basic ', '');
      const decodedCreds = Buffer.from(encodedCreds, 'base64').toString();
      expect(decodedCreds).toBe(
        `${mockConfig.REDDIT_CLIENT_ID}:${mockConfig.REDDIT_CLIENT_SECRET}`,
      );
    });
  });

  describe('createTextPost', () => {
    beforeEach(async () => {
      // Mock successful authentication
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'test-token',
          token_type: 'bearer',
          expires_in: 3600,
          scope: '*',
        }),
      });
      await client.authenticate();
      jest.clearAllMocks();
    });

    it('should successfully create a text post', async () => {
      const mockSubmitResponse = {
        json: {
          data: {
            id: 'abc123',
            name: 't3_abc123',
            url: 'https://reddit.com/r/test/comments/abc123/',
          },
          errors: [],
        },
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockSubmitResponse,
      });

      const result = await client.createTextPost(
        'test',
        'Test Title',
        'Test content',
      );

      expect(result).toEqual({
        postId: 't3_abc123',
        url: expect.stringContaining('/r/test/comments/abc123/'),
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://oauth.reddit.com/api/submit',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'bearer test-token',
            'User-Agent': mockConfig.REDDIT_USER_AGENT,
            'Content-Type': 'application/x-www-form-urlencoded',
          }),
        }),
      );

      // Verify form data
      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const body = fetchCall[1].body;
      expect(body).toContain('sr=test');
      expect(body).toContain('kind=self');
      expect(body).toContain('title=Test+Title');
      expect(body).toContain('api_type=json');
    });

    it('should handle Reddit API errors', async () => {
      const mockErrorResponse = {
        json: {
          data: {},
          errors: [
            ['SUBREDDIT_NOEXIST', "that subreddit doesn't exist", 'sr'],
          ],
        },
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockErrorResponse,
      });

      await expect(
        client.createTextPost('nonexistent', 'Title', 'Content'),
      ).rejects.toThrow("that subreddit doesn't exist");
    });

    it('should handle HTTP errors', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => 'Forbidden',
      });

      await expect(
        client.createTextPost('test', 'Title', 'Content'),
      ).rejects.toThrow('Reddit API request failed (403)');
    });
  });

  describe('createLinkPost', () => {
    beforeEach(async () => {
      // Mock successful authentication
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'test-token',
          token_type: 'bearer',
          expires_in: 3600,
          scope: '*',
        }),
      });
      await client.authenticate();
      jest.clearAllMocks();
    });

    it('should successfully create a link post', async () => {
      const mockSubmitResponse = {
        json: {
          data: {
            id: 'xyz789',
            name: 't3_xyz789',
            url: 'https://reddit.com/r/technology/comments/xyz789/',
          },
          errors: [],
        },
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockSubmitResponse,
      });

      const result = await client.createLinkPost(
        'technology',
        'Cool Article',
        'https://example.com/article',
      );

      expect(result).toEqual({
        postId: 't3_xyz789',
        url: expect.stringContaining('/r/technology/comments/xyz789/'),
      });

      // Verify form data includes kind=link and url
      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const body = fetchCall[1].body;
      expect(body).toContain('kind=link');
      expect(body).toContain('url=https');
    });
  });

  describe('getDefaultSubreddit', () => {
    it('should return configured default subreddit', () => {
      expect(client.getDefaultSubreddit()).toBe('test');
    });

    it('should return undefined when not configured', () => {
      const noDefaultConfig = {
        get: jest.fn((key: string): string | undefined => {
          if (key === 'REDDIT_DEFAULT_SUBREDDIT') return undefined;
          return mockConfig[key];
        }),
      };

      const noDefaultClient = new RedditApiClient(
        noDefaultConfig as unknown as ConfigService,
      );
      expect(noDefaultClient.getDefaultSubreddit()).toBeUndefined();
    });
  });

  describe('token refresh', () => {
    it('should refresh token before making API call if expired', async () => {
      // First auth
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'initial-token',
          token_type: 'bearer',
          expires_in: 0, // Expired immediately
          scope: '*',
        }),
      });
      await client.authenticate();

      // Second auth (refresh)
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'refreshed-token',
          token_type: 'bearer',
          expires_in: 3600,
          scope: '*',
        }),
      });

      // API call
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          json: {
            data: {
              id: 'abc',
              name: 't3_abc',
              url: 'https://reddit.com/r/test/comments/abc/',
            },
            errors: [],
          },
        }),
      });

      await client.createTextPost('test', 'Title', 'Content');

      // Should have called fetch 3 times: initial auth, refresh, API call
      expect(global.fetch).toHaveBeenCalledTimes(3);

      // Verify the API call used the refreshed token
      const apiCall = (global.fetch as jest.Mock).mock.calls[2];
      expect(apiCall[1].headers.Authorization).toBe('bearer refreshed-token');
    });
  });
});
