import { Module, Global } from '@nestjs/common';
import { CloudflareService } from './cloudflare.service.js';

@Global()
@Module({
  providers: [CloudflareService],
  exports: [CloudflareService],
})
export class CloudflareModule {}
