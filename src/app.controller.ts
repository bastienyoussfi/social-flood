import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AppService } from './app.service';

@ApiTags('health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  @ApiOperation({ summary: 'Health check endpoint' })
  @ApiResponse({ status: 200, description: 'Service is healthy' })
  getHealth() {
    return this.appService.getHealth();
  }

  @Get('api/queues/status')
  @ApiOperation({ summary: 'Get status of all queues' })
  @ApiResponse({ status: 200, description: 'Returns queue statistics' })
  async getQueuesStatus() {
    return this.appService.getQueuesStatus();
  }
}
