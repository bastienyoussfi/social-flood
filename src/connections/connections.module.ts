import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SocialConnection } from '../database/entities';
import { AuthModule } from '../auth/auth.module';
import { ConnectionsController } from './connections.controller';
import { ConnectionsService } from './connections.service';

/**
 * Connections Module
 * Manages social platform connections for authenticated users
 *
 * This module provides:
 * - API endpoints for connecting/disconnecting platforms
 * - Token refresh functionality
 * - Connection listing and management
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([SocialConnection]),
    // Import AuthModule to access OAuth services
    AuthModule,
  ],
  controllers: [ConnectionsController],
  providers: [ConnectionsService],
  exports: [ConnectionsService],
})
export class ConnectionsModule {}
