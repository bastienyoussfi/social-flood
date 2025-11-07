import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import type { Response } from 'express';
import { AppService } from './app.service';

@ApiTags('health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  @ApiOperation({ summary: 'Health check endpoint' })
  @ApiResponse({ status: 200, description: 'Service is healthy' })
  @ApiResponse({ status: 503, description: 'Service is degraded' })
  async getHealth(@Res() res: Response) {
    const health = await this.appService.getHealth();
    const statusCode =
      health.status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE;

    return res.status(statusCode).json(health);
  }

  @Get('api/queues/status')
  @ApiOperation({ summary: 'Get status of all queues' })
  @ApiResponse({ status: 200, description: 'Returns queue statistics' })
  async getQueuesStatus() {
    return this.appService.getQueuesStatus();
  }
}
