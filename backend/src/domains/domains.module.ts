import { Module } from '@nestjs/common';
import { DomainsService } from './domains.service.js';
import { DomainsController } from './domains.controller.js';

@Module({
  controllers: [DomainsController],
  providers: [DomainsService],
  exports: [DomainsService],
})
export class DomainsModule {}
