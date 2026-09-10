import { Module, Global } from '@nestjs/common';
import { TelegramService } from './telegram.service.js';

@Global()
@Module({
  providers: [TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}
