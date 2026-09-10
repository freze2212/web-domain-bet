import { Module } from '@nestjs/common';
import { ClonerService } from './cloner.service.js';
import { ClonerController } from './cloner.controller.js';

@Module({
  controllers: [ClonerController],
  providers: [ClonerService],
  exports: [ClonerService],
})
export class ClonerModule {}
