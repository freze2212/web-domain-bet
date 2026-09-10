import { Module } from '@nestjs/common';
import { BatchService } from './batch.service.js';
import { BatchController } from './batch.controller.js';
import { DomainsModule } from '../domains/domains.module.js';

@Module({
  imports: [DomainsModule],
  controllers: [BatchController],
  providers: [BatchService],
  exports: [BatchService],
})
export class BatchModule {}
