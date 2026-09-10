import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { CloudflareService } from '../cloudflare/cloudflare.service.js';

const execAsync = promisify(exec);

export interface LandingTemplate {
  id: string;
  name: string;
  title: string;
  folder: string;
  path: string;
  gitRepo?: string;
  pagesProject: string;
  cnameTarget: string;
  sampleDomain?: string;
  sampleUrl?: string;
  totalDomains?: number;
  brand: string;
  brandLabel: string;
  previewUrl?: string;
}

export const ACTIVE_TEMPLATES: LandingTemplate[] = [
  {
    id: "mm88_lp_5uae",
    name: "MM88 - CỔNG QUỐC TẾ 5 QUỐC GIA (5 UAE)",
    title: "MM88 - CỔNG QUỐC TẾ 5 QUỐC GIA (5 UAE)",
    folder: "landingpage-5uae-mm88",
    path: "C:\\Landingpages\\MM88\\landingpage-5uae-mm88",
    gitRepo: "freze2212/lp-mm88-5uae",
    pagesProject: "lp-mm88-5uae",
    cnameTarget: "lp-mm88-5uae.pages.dev",
    sampleDomain: "mm88.online",
    sampleUrl: "https://mm88.online",
    totalDomains: 1,
    brand: "MM88",
    brandLabel: "MM88"
  },
  {
    id: "lp_gg88_mx",
    name: "GG88 - VIDEO INTRO 3S + HỆ THỐNG XOÁ MÃ // S.Y.S.T.E.M",
    title: "GG88 - VIDEO INTRO 3S + HỆ THỐNG XOÁ MÃ // S.Y.S.T.E.M",
    folder: "lp-gg88-mx",
    path: "C:\\Landingpages\\GG88\\lp-gg88-mx",
    gitRepo: "freze2212/lp-gg88-mx",
    pagesProject: "lp-gg88-mx",
    cnameTarget: "lp-gg88-mx.pages.dev",
    sampleDomain: "gg88mx.com",
    sampleUrl: "https://gg88mx.com",
    totalDomains: 1,
    brand: "GG88",
    brandLabel: "GG88"
  },
  {
    id: "lp_gg88_gt9",
    name: "GG88 - VIDEO NỀN GT9 (PC & MB) + NÚT GIỮA",
    title: "GG88 - VIDEO NỀN GT9 (PC & MB) + NÚT GIỮA",
    folder: "lp-gg88-gt9",
    path: "C:\\Landingpages\\GG88\\lp-gg88-gt9",
    gitRepo: "freze2212/lp-gg88-gt9",
    pagesProject: "lp-gg88-gt9",
    cnameTarget: "lp-gg88-gt9.pages.dev",
    sampleDomain: "lp-gg88-gt9.pages.dev",
    sampleUrl: "https://lp-gg88-gt9.pages.dev",
    totalDomains: 0,
    brand: "GG88",
    brandLabel: "GG88"
  },
  {
    id: "lp_gg88_vip_2",
    name: "GG88 CỔNG QUỐC TẾ UY TÍN HÀNG ĐẦU",
    title: "GG88 CỔNG QUỐC TẾ UY TÍN HÀNG ĐẦU",
    folder: "ldpape_4d",
    path: "C:\\Landingpages\\GG88\\ldpape_4d",
    pagesProject: "lp-gg88-vip-2",
    cnameTarget: "lp-gg88-vip-2.pages.dev",
    sampleDomain: "gg88us.live",
    sampleUrl: "https://gg88us.live",
    totalDomains: 463,
    brand: "GG88",
    brandLabel: "GG88"
  },
  {
    id: "ladpage_3f_nhannhan",
    name: "Welcome to ⭐ Cổng chính thức năm 2026",
    title: "Welcome to ⭐ Cổng chính thức năm 2026",
    folder: "3f-thanhnhan",
    path: "C:\\Landingpages\\GG88\\3f-thanhnhan",
    pagesProject: "landingpage-5f-g",
    cnameTarget: "landingpage-5f-g-f3x.pages.dev",
    sampleDomain: "ggtong.me",
    sampleUrl: "https://ggtong.me",
    totalDomains: 1,
    brand: "GG88",
    brandLabel: "GG88"
  },
  {
    id: "lp_5h_gg88",
    name: "Welcome to cổng quốc tế chính thức ☀ 2026️",
    title: "Welcome to cổng quốc tế chính thức ☀ 2026️",
    folder: "landingpage-5h-gg",
    path: "C:\\Landingpages\\GG88\\landingpage-5h-gg",
    pagesProject: "lp-5h-gg88",
    cnameTarget: "lp-5h-gg88-d6b.pages.dev",
    sampleDomain: "lp-5h-gg88-d6b.pages.dev",
    sampleUrl: "https://lp-5h-gg88-d6b.pages.dev",
    totalDomains: 0,
    brand: "GG88",
    brandLabel: "GG88"
  },
  {
    id: "lp_gg882pro",
    name: "Welcome to cổng chính thức ☀️ 2026",
    title: "Welcome to cổng chính thức ☀️ 2026",
    folder: "ld-gg882pro",
    path: "C:\\Landingpages\\GG88\\ld-gg882pro",
    pagesProject: "lp-gg882pro",
    cnameTarget: "lp-gg882pro.pages.dev",
    sampleDomain: "gg8858.com",
    sampleUrl: "https://www.gg8858.com",
    totalDomains: 0,
    brand: "GG88",
    brandLabel: "GG88"
  },
  {
    id: "gg88_lp_5uae",
    name: "GG88 - LP 5 QUỐC GIA (5 UAE)",
    title: "GG88 - LP 5 QUỐC GIA (5 UAE)",
    folder: "ldpape_4d-5-quocgia",
    path: "C:\\Landingpages\\GG88\\ldpape_4d-5-quocgia",
    pagesProject: "gg88-lp-5uae",
    cnameTarget: "gg88-lp-5uae.pages.dev",
    sampleDomain: "g8fun.live",
    sampleUrl: "https://g8fun.live",
    totalDomains: 31,
    brand: "GG88",
    brandLabel: "GG88"
  },
  {
    id: "lp_1_page_gg88",
    name: "GG88 - Trang Chủ Link Tổng (g8tong.com)",
    title: "GG88 - Trang Chủ Link Tổng (g8tong.com)",
    folder: "lp-1-page-gg88",
    path: "C:\\Landingpages\\GG88\\lp-1-page-gg88",
    pagesProject: "lp-1-page-gg88",
    cnameTarget: "lp-1-page-gg88.pages.dev",
    sampleDomain: "g8tong.com",
    sampleUrl: "https://g8tong.com",
    totalDomains: 1,
    brand: "GG88",
    brandLabel: "GG88"
  },
  {
    id: "lp_1a_llwin_quocte",
    name: "LLWIN CỔNG QUỐC TẾ UY TÍN HÀNG ĐẦU",
    title: "LLWIN CỔNG QUỐC TẾ UY TÍN HÀNG ĐẦU",
    folder: "lp-1A-llwin-quocte",
    path: "C:\\Landingpages\\LLWIN\\lp-1A-llwin-quocte",
    pagesProject: "lp-1a-llwin-quocte",
    cnameTarget: "lp-1a-llwin-quocte.pages.dev",
    sampleDomain: "kjctong.com",
    sampleUrl: "https://kjctong.com",
    totalDomains: 1,
    brand: "LLWIN",
    brandLabel: "LLWIN"
  },
  {
    id: "lp_7f_xx88_games",
    name: "XX88 GAMES // CỔNG LIÊN MINH KJC 2026",
    title: "Welcome to ⭐ Cổng chính thức năm 2026",
    folder: "lp-7f-xx88-games",
    path: "C:\\Landingpages\\XX88\\lp-7f-xx88-games",
    pagesProject: "lp-7f-xx88-games",
    cnameTarget: "lp-7f-xx88-games.pages.dev",
    sampleDomain: "xx88pro.us",
    sampleUrl: "https://xx88pro.us",
    totalDomains: 1,
    brand: "XX88",
    brandLabel: "XX88"
  },
  {
    id: "lp_3c_gg88_fly88",
    name: "// NEURAL_PORTAL :: INTL_GATEWAY_2026",
    title: "// NEURAL_PORTAL :: INTL_GATEWAY_2026",
    folder: "lp-3c-gg88-fly88",
    path: "C:\\Landingpages\\GG88\\lp-3c-gg88-fly88",
    pagesProject: "lp-3c-gg88-fly88",
    cnameTarget: "lp-3c-gg88-fly88.pages.dev",
    sampleDomain: "gg8us.top",
    sampleUrl: "https://gg8us.top",
    totalDomains: 1,
    brand: "GG88",
    brandLabel: "GG88"
  },
  {
    id: "lp_xoamaan_6c_llwin",
    name: "Tool Xoá Mã Ẩn Nhà Cái | Kích Hoạt RTP & Tắt Theo Dõi IP",
    title: "Tool Xoá Mã Ẩn Nhà Cái | Kích Hoạt RTP & Tắt Theo Dõi IP",
    folder: "lp-6c-xoamaan-llwin",
    path: "C:\\Landingpages\\LLWIN\\lp-6c-xoamaan-llwin",
    pagesProject: "lp-xoamaan-6c-llwin",
    cnameTarget: "lp-xoamaan-6c-llwin.pages.dev",
    sampleDomain: "lp-xoamaan-6c-llwin.pages.dev",
    sampleUrl: "https://lp-xoamaan-6c-llwin.pages.dev",
    totalDomains: 0,
    brand: "LLWIN",
    brandLabel: "LLWIN"
  },
  {
    id: "lp_gg88_c168_qte",
    name: "Welcome to cổng quốc tế chính thức ☀ 2026️",
    title: "Welcome to cổng quốc tế chính thức ☀ 2026️",
    folder: "lp-c168-qte",
    path: "C:\\Landingpages\\LLWIN\\lp-c168-qte",
    pagesProject: "lp-gg88-c168-qte",
    cnameTarget: "lp-gg88-c168-qte.pages.dev",
    sampleDomain: "32llwin.com",
    sampleUrl: "https://32llwin.com",
    totalDomains: 0,
    brand: "LLWIN",
    brandLabel: "LLWIN"
  },
  {
    id: "lp_gg88_xoamaan",
    name: "MULTI S.Y.S.T.E.M OVERRIDE V6.9",
    title: "MULTI S.Y.S.T.E.M OVERRIDE V6.9",
    folder: "lp-c168-xoamaan",
    path: "C:\\Landingpages\\GG88\\lp-c168-xoamaan",
    pagesProject: "lp-gg88-xoamaan",
    cnameTarget: "lp-gg88-xoamaan.pages.dev",
    sampleDomain: "lp-gg88-xoamaan.pages.dev",
    sampleUrl: "https://lp-gg88-xoamaan.pages.dev",
    totalDomains: 0,
    brand: "GG88",
    brandLabel: "GG88"
  },
  {
    id: "lp_mm88_fly88",
    name: "MM88 · Cổng Link Tổng MM88 2026",
    title: "MM88 · Cổng Link Tổng MM88 2026",
    folder: "lp-fly88-mm88",
    path: "C:\\Landingpages\\MM88\\lp-fly88-mm88",
    pagesProject: "lp-mm88-fly88",
    cnameTarget: "lp-mm88-fly88.pages.dev",
    sampleDomain: "mm88top.cc",
    sampleUrl: "https://mm88top.cc",
    totalDomains: 16,
    brand: "MM88",
    brandLabel: "MM88"
  },
  {
    id: "lp_gg88_fly88",
    name: "GG88 · Cổng Link Tổng GG88 2026",
    title: "GG88 · Cổng Link Tổng GG88 2026",
    folder: "lp-gg88-fly88",
    path: "C:\\Landingpages\\GG88\\lp-gg88-fly88",
    pagesProject: "lp-gg88-fly88",
    cnameTarget: "lp-gg88-fly88.pages.dev",
    sampleDomain: "gg88en.com",
    sampleUrl: "https://gg88en.com",
    totalDomains: 22,
    brand: "GG88",
    brandLabel: "GG88"
  },
  {
    id: "lp_7f_llwin_games",
    name: "Welcome to ⭐ Cổng chính thức năm 2026",
    title: "Welcome to ⭐ Cổng chính thức năm 2026",
    folder: "lp-llwin-info",
    path: "C:\\Landingpages\\LLWIN\\lp-llwin-info",
    pagesProject: "lp-7f-llwin-games",
    cnameTarget: "lp-7f-llwin-games.pages.dev",
    sampleDomain: "lltong86.com",
    sampleUrl: "https://lltong86.com",
    totalDomains: 11,
    brand: "LLWIN",
    brandLabel: "LLWIN"
  },
  {
    id: "lp_mm88_banner_qte",
    name: "MM88 - Link Chính Thức Bảo Mật Cao",
    title: "MM88 - Link Chính Thức Bảo Mật Cao",
    folder: "lp-mm88-banner-qute",
    path: "C:\\Landingpages\\MM88\\lp-mm88-banner-qute",
    pagesProject: "lp-mm88-banner-qte",
    cnameTarget: "lp-mm88-banner-qte.pages.dev",
    sampleDomain: "lp-mm88-banner-qte.pages.dev",
    sampleUrl: "https://lp-mm88-banner-qte.pages.dev",
    totalDomains: 0,
    brand: "MM88",
    brandLabel: "MM88"
  },
  {
    id: "lp_game_vip",
    name: "CỔNG GAME QUỐC TẾ - ULTIMATE VIP",
    title: "CỔNG GAME QUỐC TẾ - ULTIMATE VIP",
    folder: "lp-mm88-dt88",
    path: "C:\\Landingpages\\GG88\\lp-mm88-dt88",
    pagesProject: "lp-game-vip",
    cnameTarget: "lp-game-vip.pages.dev",
    sampleDomain: "dt8386.cc",
    sampleUrl: "https://dt8386.cc",
    totalDomains: 3,
    brand: "GG88",
    brandLabel: "GG88"
  },
  {
    id: "lp_uae_1_button",
    name: "GG88 - NẠP 100 NHẬN TOOL XÓA MÃ ẨN",
    title: "GG88 - NẠP 100 NHẬN TOOL XÓA MÃ ẨN",
    folder: "tool",
    path: "C:\\Landingpages\\GG88\\tool",
    pagesProject: "lp-uae-1-button",
    cnameTarget: "lp-uae-1-button.pages.dev",
    sampleDomain: "gg88us.live",
    sampleUrl: "https://gg88us.live",
    totalDomains: 409,
    brand: "GG88",
    brandLabel: "GG88"
  },
  {
    id: "lp_9d_xoaip_gg88",
    name: "xoamagame",
    title: "xoamagame",
    folder: "lp-xoaipan-9d-g",
    path: "C:\\Landingpages\\GG88\\lp-xoaipan-9d-g",
    pagesProject: "lp-9d-xoaip-gg88",
    cnameTarget: "lp-9d-xoaip-gg88-4va.pages.dev",
    sampleDomain: "lp-9d-xoaip-gg88-4va.pages.dev",
    sampleUrl: "https://lp-9d-xoaip-gg88-4va.pages.dev",
    totalDomains: 0,
    brand: "GG88",
    brandLabel: "GG88"
  },
  {
    id: "lp_xoatong_net",
    name: "BLACKSITE CONSOLE - XÓA ID BẨN & KÍCH HOẠT MAXWIN",
    title: "BLACKSITE CONSOLE - XÓA ID BẨN & KÍCH HOẠT MAXWIN",
    folder: "LP-XOATONG.NET",
    path: "C:\\Landingpages\\GG88\\LP-XOATONG.NET",
    pagesProject: "lp-xoatong-net",
    cnameTarget: "lp-xoatong-net.pages.dev",
    sampleDomain: "g88tong.net",
    sampleUrl: "https://g88tong.net",
    totalDomains: 4,
    brand: "GG88",
    brandLabel: "GG88"
  },
  {
    id: "landingpage_5f_g",
    name: "GG88 - CỔNG QUỐC TẾ 2026 - SINGAPORE (5F)",
    title: "GG88 - Cổng Chính Thức 2026 - Singapore",
    folder: "landing-page-5f",
    path: "C:\\Landingpages\\GG88\\landing-page-5f",
    pagesProject: "landingpage-5f-gg88",
    cnameTarget: "landingpage-5f-gg88.pages.dev",
    sampleDomain: "landingpage-5f-gg88.pages.dev",
    sampleUrl: "https://landingpage-5f-gg88.pages.dev",
    totalDomains: 8,
    brand: "GG88",
    brandLabel: "GG88"
  },
  {
    id: "landingpage_5f_phi",
    name: "GG88 - CỔNG QUỐC TẾ 2026 - PHILIPPINES (5F)",
    title: "GG88 - Cổng Chính Thức 2026 - Philippines",
    folder: "landing-page-5f-phi",
    path: "C:\\Landingpages\\GG88\\landing-page-5f-phi",
    gitRepo: "freze2212/landingpage-5f-phi",
    pagesProject: "landingpage-5f-g",
    cnameTarget: "landingpage-5f-g.pages.dev",
    sampleDomain: "gg88phi.com",
    sampleUrl: "https://gg88phi.com",
    totalDomains: 1,
    brand: "GG88",
    brandLabel: "GG88"
  },
  {
    id: "landingpage_5f_llwin",
    name: "LLWIN - CỔNG QUỐC TẾ 2026 - PHILIPPINES (5F)",
    title: "LLWIN - Cổng Chính Thức 2026 - Philippines",
    folder: "landing-page-5f",
    path: "C:\\Landingpages\\LLWIN\\landing-page-5f",
    pagesProject: "lp-7f-llwin-games",
    cnameTarget: "lp-7f-llwin-games.pages.dev",
    sampleDomain: "lp-7f-llwin-games.pages.dev",
    sampleUrl: "https://lp-7f-llwin-games.pages.dev",
    totalDomains: 0,
    brand: "LLWIN",
    brandLabel: "LLWIN"
  },
  {
    id: "lp_llwin_llwind_top",
    name: "Welcome to cổng chính thức ☀️ 2026",
    title: "Welcome to cổng chính thức ☀️ 2026",
    folder: "lp-llwind.top",
    path: "C:\\Landingpages\\LLWIN\\lp-llwind.top",
    pagesProject: "lp-llwin-llwind-top",
    cnameTarget: "lp-llwin-llwind-top.pages.dev",
    sampleDomain: "llwind.top",
    sampleUrl: "https://llwind.top",
    totalDomains: 2,
    brand: "LLWIN",
    brandLabel: "LLWIN"
  },
  {
    id: "lp_mm88sin_top",
    name: "Welcome to cổng chính thức ☀️ 2026",
    title: "Welcome to cổng chính thức ☀️ 2026",
    folder: "lp-mm88sin.top",
    path: "C:\\Landingpages\\MM88\\lp-mm88sin.top",
    pagesProject: "lp-mm88sin-top",
    cnameTarget: "lp-mm88sin-top.pages.dev",
    sampleDomain: "mm88sin.top",
    sampleUrl: "https://mm88sin.top",
    totalDomains: 4,
    brand: "MM88",
    brandLabel: "MM88"
  },
  {
    id: "lp_1a_xx88_quocte",
    name: "XX88 CỔNG QUỐC TẾ UY TÍN HÀNG ĐẦU",
    title: "XX88 CỔNG QUỐC TẾ UY TÍN HÀNG ĐẦU",
    folder: "lp-1a-xx88-quocte",
    path: "C:\\Landingpages\\XX88\\lp-1a-xx88-quocte",
    gitRepo: "freze2212/lp-1a-xx88-quocte",
    pagesProject: "lp-1a-xx88-quocte",
    cnameTarget: "lp-1a-xx88-quocte.pages.dev",
    sampleDomain: "lp-1a-xx88-quocte.pages.dev",
    sampleUrl: "https://lp-1a-xx88-quocte.pages.dev",
    totalDomains: 0,
    brand: "XX88",
    brandLabel: "XX88"
  }
];

@Injectable()
export class TemplatesService {
  private readonly logger = new Logger(TemplatesService.name);

  constructor(private readonly cloudflareService: CloudflareService) {}

  listTemplates(brand?: string): LandingTemplate[] {
    let list = ACTIVE_TEMPLATES.map((t) => ({
      ...t,
      previewUrl: t.sampleUrl || `https://${t.cnameTarget}`,
    }));

    if (brand && brand !== 'ALL') {
      list = list.filter((t) => t.brand?.toUpperCase() === brand.toUpperCase());
    }

    return list;
  }

  getTemplate(idOrCname: string): LandingTemplate | null {
    if (!idOrCname) return ACTIVE_TEMPLATES[0];
    const clean = idOrCname.trim().toLowerCase();
    const found = ACTIVE_TEMPLATES.find(
      (t) =>
        t.id.toLowerCase() === clean ||
        t.folder.toLowerCase() === clean ||
        t.pagesProject.toLowerCase() === clean ||
        t.cnameTarget.toLowerCase() === clean,
    );
    return found || ACTIVE_TEMPLATES[0];
  }

  findTemplateByDomain(domain: string): LandingTemplate | null {
    const norm = domain.trim().toLowerCase().replace(/^www\./, '');
    for (const t of ACTIVE_TEMPLATES) {
      if (!t.path) continue;
      const djPath = path.join(t.path, 'domains.json');
      if (fs.existsSync(djPath)) {
        try {
          const dj = JSON.parse(fs.readFileSync(djPath, 'utf8'));
          if (norm in dj) return t;
        } catch {}
      }
    }
    return null;
  }

  async updateTemplateDomainsJson(templateIdOrCname: string, domain: string, mainUrl: string, messengerUrl = '') {
    const tpl = this.getTemplate(templateIdOrCname);
    if (!tpl || !tpl.path) {
      return { success: false, message: 'Template path not found' };
    }

    if (!fs.existsSync(tpl.path)) {
      this.logger.warn(`Local template directory not found: ${tpl.path}`);
      return { success: true, warning: 'Local directory not found, skipping git commit' };
    }

    const djPath = path.join(tpl.path, 'domains.json');
    let dj: Record<string, any> = {};
    if (fs.existsSync(djPath)) {
      try {
        dj = JSON.parse(fs.readFileSync(djPath, 'utf8'));
      } catch {}
    }

    const norm = domain.trim().toLowerCase().replace(/^www\./, '');
    const entry = {
      main_url: mainUrl,
      messenger_url: messengerUrl || mainUrl,
      telegram_url: messengerUrl || undefined,
    };
    dj[norm] = entry;
    dj[`www.${norm}`] = entry;

    fs.writeFileSync(djPath, JSON.stringify(dj, null, 2), 'utf8');

    // Commit and push if git exists
    const gitDir = path.join(tpl.path, '.git');
    if (fs.existsSync(gitDir)) {
      try {
        await execAsync(`git add domains.json && git commit -m "Auto add domain ${norm}"`, { cwd: tpl.path });
        await execAsync('git push origin main', { cwd: tpl.path }).catch(() => {});
      } catch (err: any) {
        this.logger.warn(`Git push error: ${err.message}`);
      }
    }

    return { success: true, path: djPath };
  }
}
