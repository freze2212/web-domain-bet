import { Controller, Post, Body, Req, UseGuards } from '@nestjs/common';
import { BatchService, ParsedBatchLine } from './batch.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';

@Controller('api/batch')
export class BatchController {
  constructor(private readonly batchService: BatchService) {}

  @Post('parse')
  parseInput(@Body() body: { text: string; defaultCname?: string }) {
    return this.batchService.parseBatchInput(body.text, body.defaultCname);
  }

  @UseGuards(JwtAuthGuard)
  @Post('execute')
  async executeBatch(
    @Body() body: { items: ParsedBatchLine[]; mode: 'buy' | 'point' },
    @Req() req: any,
  ) {
    return this.batchService.executeBatch({
      items: body.items,
      mode: body.mode || 'point',
      user: req.user,
    });
  }
}
