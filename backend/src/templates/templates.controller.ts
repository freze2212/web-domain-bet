import { Controller, Get, Query, Param, UseGuards } from '@nestjs/common';
import { TemplatesService } from './templates.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';

@Controller('api/templates')
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Get()
  listTemplates(@Query('brand') brand?: string) {
    const templates = this.templatesService.listTemplates(brand);
    return {
      success: true,
      count: templates.length,
      templates,
    };
  }

  @Get(':id')
  getTemplate(@Param('id') id: string) {
    const template = this.templatesService.getTemplate(id);
    return {
      success: true,
      template,
    };
  }
}
