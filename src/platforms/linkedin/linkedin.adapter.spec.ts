/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { LinkedInAdapter } from './linkedin.adapter';
import { PostContent, PostStatus, Platform } from '../../common/interfaces';

describe('LinkedInAdapter', () => {
  let adapter: LinkedInAdapter;
  let mockQueue: any;

  const mockJob = {
    id: 'test-job-123',
    getState: jest.fn(),
    returnvalue: null,
    failedReason: null,
  };

  beforeEach(async () => {
    mockQueue = {
      add: jest.fn().mockResolvedValue(mockJob),
      getJob: jest.fn().mockResolvedValue(mockJob),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LinkedInAdapter,
        {
          provide: getQueueToken('linkedin-posts'),
          useValue: mockQueue,
        },
      ],
    }).compile();

    adapter = module.get<LinkedInAdapter>(LinkedInAdapter);
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
        text: 'Test LinkedIn post',
      };

      const result = await adapter.post(content);

      expect(result).toEqual({
        jobId: 'test-job-123',
        status: PostStatus.QUEUED,
        platform: Platform.LINKEDIN,
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
      };

      const result = await adapter.post(content);

      expect(result).toEqual({
        jobId: '',
        status: PostStatus.FAILED,
        platform: Platform.LINKEDIN,
        error: 'Text content is required',
      });

      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('should return failed status for text exceeding character limit', async () => {
      const content: PostContent = {
        text: 'a'.repeat(3001),
      };

      const result = await adapter.post(content);

      expect(result.status).toBe(PostStatus.FAILED);
      expect(result.error).toContain("exceeds LinkedIn's 3000 character limit");
    });
  });

  describe('validateContent', () => {
    it('should validate correct content', () => {
      const content: PostContent = {
        text: 'Valid LinkedIn post',
      };

      const result = adapter.validateContent(content);

      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should fail validation for empty text', () => {
      const content: PostContent = {
        text: '',
      };

      const result = adapter.validateContent(content);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Text content is required');
    });

    it('should fail validation for whitespace-only text', () => {
      const content: PostContent = {
        text: '   ',
      };

      const result = adapter.validateContent(content);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Text content is required');
    });

    it('should fail validation for text exceeding character limit', () => {
      const content: PostContent = {
        text: 'a'.repeat(3001),
      };

      const result = adapter.validateContent(content);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "Text exceeds LinkedIn's 3000 character limit",
      );
    });

    it('should accept text at character limit', () => {
      const content: PostContent = {
        text: 'a'.repeat(3000),
      };

      const result = adapter.validateContent(content);

      expect(result.valid).toBe(true);
    });
  });

  describe('getPostStatus', () => {
    it('should return completed status', async () => {
      mockJob.getState.mockResolvedValue('completed');
      mockJob.returnvalue = {
        platformPostId: 'linkedin-123',
        url: 'https://www.linkedin.com/feed/update/urn:li:share:linkedin-123',
      };

      const result = await adapter.getPostStatus('test-job-123');

      expect(result).toEqual({
        jobId: 'test-job-123',
        status: PostStatus.POSTED,
        platform: Platform.LINKEDIN,
        platformPostId: 'linkedin-123',
        url: 'https://www.linkedin.com/feed/update/urn:li:share:linkedin-123',
        error: null,
      });
    });

    it('should return failed status', async () => {
      mockJob.getState.mockResolvedValue('failed');
      mockJob.failedReason = 'API error';
      mockJob.returnvalue = null;

      const result = await adapter.getPostStatus('test-job-123');

      expect(result).toEqual({
        jobId: 'test-job-123',
        status: PostStatus.FAILED,
        platform: Platform.LINKEDIN,
        platformPostId: undefined,
        url: undefined,
        error: 'API error',
      });
    });

    it('should return queued status for pending job', async () => {
      mockJob.getState.mockResolvedValue('waiting');

      const result = await adapter.getPostStatus('test-job-123');

      expect(result.status).toBe(PostStatus.QUEUED);
    });

    it('should return failed status if job not found', async () => {
      mockQueue.getJob.mockResolvedValue(null);

      const result = await adapter.getPostStatus('non-existent-job');

      expect(result).toEqual({
        jobId: 'non-existent-job',
        status: PostStatus.FAILED,
        platform: Platform.LINKEDIN,
        error: 'Job not found',
      });
    });
  });
});
