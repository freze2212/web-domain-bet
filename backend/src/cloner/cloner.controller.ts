import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ClonerService } from './cloner.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';

@Controller('api/cloner')
export class ClonerController {
  constructor(private readonly clonerService: ClonerService) {}

  @UseGuards(JwtAuthGuard)
  @Post('clone')
  async clone(@Body() body: { url: string; cleanJs?: boolean; downloadAssets?: boolean }) {
    return this.clonerService.cloneWebsite(body.url, {
      cleanJs: body.cleanJs,
      downloadAssets: body.downloadAssets,
    });
  }
}
