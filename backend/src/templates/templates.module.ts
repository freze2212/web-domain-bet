import { Module, Global } from '@nestjs/common';
import { TemplatesService } from './templates.service.js';
import { TemplatesController } from './templates.controller.js';

@Global()
@Module({
  controllers: [TemplatesController],
  providers: [TemplatesService],
  exports: [TemplatesService],
})
export class TemplatesModule {}
