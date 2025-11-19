import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { Job } from 'bull';
import { RedditAdapter } from './reddit.adapter';
import { PostContent, PostStatus, Platform } from '../../common/interfaces';

type MockQueue = {
  add: jest.Mock;
  getJob: jest.Mock;
};

describe('RedditAdapter', () => {
  let adapter: RedditAdapter;
  let mockQueue: MockQueue;

  const mockJob = {
    id: 'test-job-123',
    getState: jest.fn(),
    returnvalue: null as any,
    failedReason: undefined as string | undefined,
    isCompleted: jest.fn(),
    isFailed: jest.fn(),
  } as Partial<Job> & {
    getState: jest.Mock;
    isCompleted: jest.Mock;
    isFailed: jest.Mock;
  };

  beforeEach(async () => {
    mockQueue = {
      add: jest.fn().mockResolvedValue(mockJob),
      getJob: jest.fn().mockResolvedValue(mockJob),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedditAdapter,
        {
          provide: getQueueToken('reddit-posts'),
          useValue: mockQueue,
        },
      ],
    }).compile();

    adapter = module.get<RedditAdapter>(RedditAdapter);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should be defined', () => {
      expect(adapter).toBeDefined();
    });
  });

  describe('post', () => {
    it('should add post to queue successfully', async () => {
      const content: PostContent = {
        text: 'Test Reddit post',
        metadata: {
          title: 'Test Title',
          subreddit: 'test',
        },
      };

      const result = await adapter.post(content);

      expect(result).toEqual({
        jobId: 'test-job-123',
        status: PostStatus.QUEUED,
        platform: Platform.REDDIT,
      });

      expect(mockQueue.add).toHaveBeenCalledWith('post', content, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      });
    });

    it('should return failed status for invalid content', async () => {
      const content: PostContent = {
        text: '',
        metadata: {
          title: 'Test',
          subreddit: 'test',
        },
      };

      const result = await adapter.post(content);

      expect(result).toEqual({
        jobId: '',
        status: PostStatus.FAILED,
        platform: Platform.REDDIT,
        error: 'Text content cannot be empty',
      });

      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('should return failed status when title is missing', async () => {
      const content: PostContent = {
        text: 'Test post',
        metadata: {
          subreddit: 'test',
        },
      };

      const result = await adapter.post(content);

      expect(result.status).toBe(PostStatus.FAILED);
      expect(result.error).toContain('Title is required');
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('should return failed status when subreddit is missing', async () => {
      const content: PostContent = {
        text: 'Test post',
        metadata: {
          title: 'Test Title',
        },
      };

      const result = await adapter.post(content);

      expect(result.status).toBe(PostStatus.FAILED);
      expect(result.error).toContain('Subreddit is required');
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('should return failed status for text exceeding character limit', async () => {
      const content: PostContent = {
        text: 'a'.repeat(40001),
        metadata: {
          title: 'Test Title',
          subreddit: 'test',
        },
      };

      const result = await adapter.post(content);

      expect(result.status).toBe(PostStatus.FAILED);
      expect(result.error).toContain('exceeds maximum length of 40000 characters');
    });

    it('should return failed status for title exceeding character limit', async () => {
      const content: PostContent = {
        text: 'Test post',
        metadata: {
          title: 'a'.repeat(301),
          subreddit: 'test',
        },
      };

      const result = await adapter.post(content);

      expect(result.status).toBe(PostStatus.FAILED);
      expect(result.error).toContain('exceeds maximum length of 300 characters');
    });
  });

  describe('validateContent', () => {
    it('should validate correct content', () => {
      const content: PostContent = {
        text: 'Valid Reddit post',
        metadata: {
          title: 'Valid Title',
          subreddit: 'test',
        },
      };

      const result = adapter.validateContent(content);

      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should fail validation for empty text', () => {
      const content: PostContent = {
        text: '',
        metadata: {
          title: 'Test',
          subreddit: 'test',
        },
      };

      const result = adapter.validateContent(content);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Text content cannot be empty');
    });

    it('should fail validation for whitespace-only text', () => {
      const content: PostContent = {
        text: '   ',
        metadata: {
          title: 'Test',
          subreddit: 'test',
        },
      };

      const result = adapter.validateContent(content);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Text content cannot be empty');
    });

    it('should fail validation for missing title', () => {
      const content: PostContent = {
        text: 'Test post',
        metadata: {
          subreddit: 'test',
        },
      };

      const result = adapter.validateContent(content);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Title is required');
    });

    it('should fail validation for empty title', () => {
      const content: PostContent = {
        text: 'Test post',
        metadata: {
          title: '',
          subreddit: 'test',
        },
      };

      const result = adapter.validateContent(content);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Title cannot be empty');
    });

    it('should fail validation for title exceeding limit', () => {
      const content: PostContent = {
        text: 'Test post',
        metadata: {
          title: 'a'.repeat(301),
          subreddit: 'test',
        },
      };

      const result = adapter.validateContent(content);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('exceeds maximum length of 300 characters');
    });

    it('should fail validation for missing subreddit', () => {
      const content: PostContent = {
        text: 'Test post',
        metadata: {
          title: 'Test Title',
        },
      };

      const result = adapter.validateContent(content);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Subreddit is required');
    });

    it('should fail validation for subreddit with spaces', () => {
      const content: PostContent = {
        text: 'Test post',
        metadata: {
          title: 'Test Title',
          subreddit: 'test subreddit',
        },
      };

      const result = adapter.validateContent(content);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Subreddit name cannot contain spaces');
    });

    it('should fail validation for text exceeding limit', () => {
      const content: PostContent = {
        text: 'a'.repeat(40001),
        metadata: {
          title: 'Test Title',
          subreddit: 'test',
        },
      };

      const result = adapter.validateContent(content);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('exceeds maximum length of 40000 characters');
    });

    it('should fail validation for multiple media attachments', () => {
      const content: PostContent = {
        text: 'Test post',
        media: [
          { url: 'https://example.com/image1.jpg', type: 'image' },
          { url: 'https://example.com/image2.jpg', type: 'image' },
        ],
        metadata: {
          title: 'Test Title',
          subreddit: 'test',
        },
      };

      const result = adapter.validateContent(content);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('supports only one media attachment');
    });

    it('should pass validation for single media attachment', () => {
      const content: PostContent = {
        text: 'Test post',
        media: [{ url: 'https://example.com/image.jpg', type: 'image' }],
        metadata: {
          title: 'Test Title',
          subreddit: 'test',
        },
      };

      const result = adapter.validateContent(content);

      expect(result.valid).toBe(true);
    });
  });

  describe('getPostStatus', () => {
    it('should return status for completed job', async () => {
      mockJob.isCompleted.mockResolvedValue(true);
      mockJob.isFailed.mockResolvedValue(false);
      mockJob.returnvalue = {
        platformPostId: 't3_abc123',
        url: 'https://reddit.com/r/test/comments/abc123/',
      };

      const result = await adapter.getPostStatus('test-job-123');

      expect(result).toEqual({
        jobId: 'test-job-123',
        status: PostStatus.POSTED,
        platform: Platform.REDDIT,
        platformPostId: 't3_abc123',
        url: 'https://reddit.com/r/test/comments/abc123/',
      });
    });

    it('should return status for failed job', async () => {
      mockJob.isCompleted.mockResolvedValue(false);
      mockJob.isFailed.mockResolvedValue(true);
      mockJob.failedReason = 'API Error';

      const result = await adapter.getPostStatus('test-job-123');

      expect(result).toEqual({
        jobId: 'test-job-123',
        status: PostStatus.FAILED,
        platform: Platform.REDDIT,
        error: 'API Error',
      });
    });

    it('should return status for queued job', async () => {
      mockJob.isCompleted.mockResolvedValue(false);
      mockJob.isFailed.mockResolvedValue(false);

      const result = await adapter.getPostStatus('test-job-123');

      expect(result).toEqual({
        jobId: 'test-job-123',
        status: PostStatus.QUEUED,
        platform: Platform.REDDIT,
      });
    });

    it('should return failed status when job not found', async () => {
      mockQueue.getJob.mockResolvedValueOnce(null);

      const result = await adapter.getPostStatus('nonexistent-job');

      expect(result).toEqual({
        jobId: 'nonexistent-job',
        status: PostStatus.FAILED,
        platform: Platform.REDDIT,
        error: 'Job not found',
      });
    });
  });
});
