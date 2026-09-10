import { Module } from '@nestjs/common';
import { DomainOrdersService } from './domain-orders.service.js';
import { DomainOrdersController } from './domain-orders.controller.js';

@Module({
  controllers: [DomainOrdersController],
  providers: [DomainOrdersService],
  exports: [DomainOrdersService],
})
export class DomainOrdersModule {}
