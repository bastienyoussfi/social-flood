import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { InjectConnection } from '@nestjs/typeorm';
import type { Connection } from 'typeorm';

@Injectable()
export class AppService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectQueue('linkedin-posts') private readonly linkedInQueue: Queue,
    @InjectQueue('twitter-posts') private readonly twitterQueue: Queue,
    @InjectQueue('bluesky-posts') private readonly blueskyQueue: Queue,
  ) {}

  async getHealth() {
    const checks = await Promise.allSettled([
      this.checkDatabase(),
      this.checkRedis(),
    ]);

    const [dbResult, redisResult] = checks;

    const dbStatus =
      dbResult.status === 'fulfilled' && dbResult.value
        ? 'healthy'
        : 'unhealthy';

    const redisStatus =
      redisResult.status === 'fulfilled' && redisResult.value
        ? 'healthy'
        : 'unhealthy';

    const isHealthy = dbStatus === 'healthy' && redisStatus === 'healthy';

    return {
      status: isHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      services: {
        database: dbStatus,
        redis: redisStatus,
      },
    };
  }

  private async checkDatabase(): Promise<boolean> {
    try {
      if (!this.connection.isInitialized) {
        return false;
      }

      await this.connection.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  private async checkRedis(): Promise<boolean> {
    try {
      const client = this.linkedInQueue.client;
      await client.ping();
      return true;
    } catch {
      return false;
    }
  }

  async getQueuesStatus() {
    const getQueueStats = async (queue: Queue, name: string) => {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getCompletedCount(),
        queue.getFailedCount(),
        queue.getDelayedCount(),
      ]);

      return {
        name,
        waiting,
        active,
        completed,
        failed,
        delayed,
      };
    };

    const [linkedIn, twitter, bluesky] = await Promise.all([
      getQueueStats(this.linkedInQueue, 'linkedin-posts'),
      getQueueStats(this.twitterQueue, 'twitter-posts'),
      getQueueStats(this.blueskyQueue, 'bluesky-posts'),
    ]);

    return {
      timestamp: new Date().toISOString(),
      queues: {
        linkedIn,
        twitter,
        bluesky,
      },
    };
  }
}
