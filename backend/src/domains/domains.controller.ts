import { Controller, Get, Post, Body, Query, Req, UseGuards } from '@nestjs/common';
import { DomainsService } from './domains.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';

@Controller('api/domains')
export class DomainsController {
  constructor(private readonly domainsService: DomainsService) {}

  @Get('check')
  async checkDomain(@Query('domain') domain: string) {
    return this.domainsService.checkDomain(domain || '');
  }

  @UseGuards(JwtAuthGuard)
  @Post('buy')
  async buyDomain(
    @Body() body: { domain: string; cnameTarget: string; targetUrl: string; telegramUrl?: string },
    @Req() req: any,
  ) {
    return this.domainsService.buyAndConfigureDomain({
      domain: body.domain,
      cnameTarget: body.cnameTarget,
      targetUrl: body.targetUrl,
      telegramUrl: body.telegramUrl,
      user: req.user,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Post('point')
  async pointDomain(
    @Body() body: { domain: string; cnameTarget: string; targetUrl: string; telegramUrl?: string },
    @Req() req: any,
  ) {
    return this.domainsService.pointExistingDomain({
      domain: body.domain,
      cnameTarget: body.cnameTarget,
      targetUrl: body.targetUrl,
      telegramUrl: body.telegramUrl,
      user: req.user,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get('list')
  async listDomains(@Req() req: any) {
    const list = await this.domainsService.listDomains(req.user);
    return { success: true, count: list.length, domains: list };
  }
}
