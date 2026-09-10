import { Controller, Get, Post, Query, Body, UseGuards } from '@nestjs/common';
import { HealthService } from './health.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';

@Controller('api/health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @UseGuards(JwtAuthGuard)
  @Get('inspect')
  async inspectDomain(@Query('domain') domain: string) {
    return this.healthService.inspectDomain(domain || '');
  }

  @UseGuards(JwtAuthGuard)
  @Post('repair')
  async repairDomain(@Body() body: { domain: string; targetCname?: string }) {
    return this.healthService.autoRepairDomain(body.domain, body.targetCname || 'lp-gg88-vip-2.pages.dev');
  }
}
