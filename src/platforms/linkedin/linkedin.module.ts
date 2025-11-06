import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule } from '@nestjs/config';
import { LinkedInAdapter } from './linkedin.adapter';
import { LinkedInService } from './linkedin.service';
import { LinkedInProcessor } from './linkedin.processor';

@Module({
  imports: [
    ConfigModule,
    BullModule.registerQueue({
      name: 'linkedin-posts',
    }),
  ],
  providers: [LinkedInAdapter, LinkedInService, LinkedInProcessor],
  exports: [LinkedInAdapter],
})
export class LinkedInModule {}
