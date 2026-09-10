import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import * as path from 'node:path';
import * as fs from 'node:fs';
import AdmZip from 'adm-zip';
import { appConfig } from '../config/env.config.js';

@Injectable()
export class ClonerService {
  private readonly logger = new Logger(ClonerService.name);

  async cloneWebsite(targetUrl: string, options: { cleanJs?: boolean; downloadAssets?: boolean } = {}) {
    if (!targetUrl || !targetUrl.startsWith('http')) {
      throw new BadRequestException('URL không hợp lệ. Phải bắt đầu bằng http:// hoặc https://');
    }

    this.logger.log(`[Cloner] Đang cào dữ liệu từ ${targetUrl}...`);

    try {
      const response = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();

      // Create ZIP in memory with index.html
      const zip = new AdmZip();
      zip.addFile('index.html', Buffer.from(html, 'utf8'));

      const cloneId = `clone_${Date.now()}`;
      const exportDir = path.join(appConfig.dataDir, 'clones');
      if (!fs.existsSync(exportDir)) {
        fs.mkdirSync(exportDir, { recursive: true });
      }

      const zipPath = path.join(exportDir, `${cloneId}.zip`);
      zip.writeZip(zipPath);

      return {
        success: true,
        cloneId,
        url: targetUrl,
        sizeBytes: html.length,
        message: 'Đã sao chép website thành công!',
      };
    } catch (err: any) {
      throw new BadRequestException(`Lỗi khi cào dữ liệu: ${err.message}`);
    }
  }
}
