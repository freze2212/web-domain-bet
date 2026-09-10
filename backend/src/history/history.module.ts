import { Module, Global } from '@nestjs/common';
import { HistoryService } from './history.service.js';
import { HistoryController } from './history.controller.js';

@Global()
@Module({
  controllers: [HistoryController],
  providers: [HistoryService],
  exports: [HistoryService],
})
export class HistoryModule {}
