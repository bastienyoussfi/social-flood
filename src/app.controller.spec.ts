import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;
  let appService: AppService;
  let mockResponse: Partial<Response>;

  beforeEach(async () => {
    const mockAppService = {
      getHealth: jest.fn(),
      getQueuesStatus: jest.fn(),
    };

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: AppService,
          useValue: mockAppService,
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
    appService = app.get<AppService>(AppService);

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    } as Partial<Response>;
  });

  describe('getHealth', () => {
    it('should return healthy status with 200 when all services are healthy', async () => {
      const healthyResponse = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        services: {
          database: 'healthy',
          redis: 'healthy',
        },
      };

      const getHealthSpy = jest
        .spyOn(appService, 'getHealth')
        .mockResolvedValue(healthyResponse);

      await appController.getHealth(mockResponse as Response);

      expect(getHealthSpy).toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(mockResponse.json).toHaveBeenCalledWith(healthyResponse);
    });

    it('should return degraded status with 503 when services are unhealthy', async () => {
      const degradedResponse = {
        status: 'degraded',
        timestamp: new Date().toISOString(),
        services: {
          database: 'unhealthy',
          redis: 'healthy',
        },
      };

      const getHealthSpy = jest
        .spyOn(appService, 'getHealth')
        .mockResolvedValue(degradedResponse);

      await appController.getHealth(mockResponse as Response);

      expect(getHealthSpy).toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(
        HttpStatus.SERVICE_UNAVAILABLE,
      );
      expect(mockResponse.json).toHaveBeenCalledWith(degradedResponse);
    });

    it('should return degraded status with 503 when database is unhealthy', async () => {
      const degradedResponse = {
        status: 'degraded',
        timestamp: new Date().toISOString(),
        services: {
          database: 'unhealthy',
          redis: 'healthy',
        },
      };

      jest.spyOn(appService, 'getHealth').mockResolvedValue(degradedResponse);

      await appController.getHealth(mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(
        HttpStatus.SERVICE_UNAVAILABLE,
      );
      expect(mockResponse.json).toHaveBeenCalledWith(degradedResponse);
    });

    it('should return degraded status with 503 when Redis is unhealthy', async () => {
      const degradedResponse = {
        status: 'degraded',
        timestamp: new Date().toISOString(),
        services: {
          database: 'healthy',
          redis: 'unhealthy',
        },
      };

      jest.spyOn(appService, 'getHealth').mockResolvedValue(degradedResponse);

      await appController.getHealth(mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(
        HttpStatus.SERVICE_UNAVAILABLE,
      );
      expect(mockResponse.json).toHaveBeenCalledWith(degradedResponse);
    });
  });
});
