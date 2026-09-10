import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { HistoryService } from './history.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';

@Controller('api/history')
export class HistoryController {
  constructor(private readonly historyService: HistoryService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  getHistory(@Req() req: any) {
    const list = this.historyService.getHistory(req.user.role === 'admin' ? undefined : req.user.id);
    return { success: true, count: list.length, history: list };
  }
}
