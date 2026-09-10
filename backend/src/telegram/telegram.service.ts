import { Injectable, Logger } from '@nestjs/common';
import { appConfig } from '../config/env.config.js';

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);

  async sendMessage(text: string, chatId?: string): Promise<boolean> {
    const token = appConfig.telegramBotToken;
    const targetChat = chatId || appConfig.telegramChatId;

    if (!token || !targetChat) {
      this.logger.debug('Telegram token or chat ID not configured, skipping message');
      return false;
    }

    try {
      const url = `https://api.telegram.org/bot${token}/sendMessage`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: targetChat,
          text,
          parse_mode: 'HTML',
        }),
      });
      const data: any = await res.json();
      return data.ok;
    } catch (err: any) {
      this.logger.warn(`Lỗi gửi Telegram: ${err.message}`);
      return false;
    }
  }
}
