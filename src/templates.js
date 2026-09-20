import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { updateJsConfigFile } from "./repo-scanner.js";
import { stripDomainsJsonFallbacks } from "./lp-link-patch.js";
import { deployToAllPagesInstances, ensureLiveDomainLink } from "./cloudflare.js";

const execAsync = promisify(exec);

// Danh sách các mẫu Landing Page CHUẨN HOẠT ĐỘNG (Verified Active on Cloudflare Pages)
export const ACTIVE_TEMPLATES = [
  {
    "id": "mm88_lp_5uae",
    "name": "MM88 - CỔNG QUỐC TẾ 5 QUỐC GIA (5 UAE)",
    "title": "MM88 - CỔNG QUỐC TẾ 5 QUỐC GIA (5 UAE)",
    "folder": "landingpage-5uae-mm88",
    "path": "C:\\Landingpages\\MM88\\landingpage-5uae-mm88",
    "gitRepo": "freze2212/lp-mm88-5uae",
    "pagesProject": "lp-mm88-5uae-git2",
    "cnameTarget": "lp-mm88-5uae-git2.pages.dev",
    "sampleDomain": "mm88.online",
    "sampleUrl": "https://mm88.online",
    "totalDomains": 1,
    "brand": "MM88",
    "brandLabel": "MM88"
  },
  {
    "id": "lp_gg88_mx",
    "name": "GG88 - VIDEO INTRO 3S + HỆ THỐNG XOÁ MÃ // S.Y.S.T.E.M",
    "title": "GG88 - VIDEO INTRO 3S + HỆ THỐNG XOÁ MÃ // S.Y.S.T.E.M",
    "folder": "lp-gg88-mx",
    "path": "C:\\Landingpages\\GG88\\lp-gg88-mx",
    "gitRepo": "freze2212/lp-gg88-mx",
    "pagesProject": "lp-gg88-mx-git2",
    "cnameTarget": "lp-gg88-mx-git2.pages.dev",
    "sampleDomain": "gg88mx.com",
    "sampleUrl": "https://gg88mx.com",
    "totalDomains": 1,
    "brand": "GG88",
    "brandLabel": "GG88"
  },
  {
    "id": "lp_gg88_gt9",
    "name": "GG88 - VIDEO NỀN GT9 (PC & MB) + NÚT GIỮA",
    "title": "GG88 - VIDEO NỀN GT9 (PC & MB) + NÚT GIỮA",
    "folder": "lp-gg88-gt9",
    "path": "C:\\Landingpages\\GG88\\lp-gg88-gt9",
    "gitRepo": "freze2212/lp-gg88-gt9",
    "pagesProject": "lp-gg88-gt9-git2",
    "cnameTarget": "lp-gg88-gt9-git2.pages.dev",
    "sampleDomain": "lp-gg88-gt9-git2.pages.dev",
    "sampleUrl": "https://lp-gg88-gt9-git2.pages.dev",
    "totalDomains": 0,
    "brand": "GG88",
    "brandLabel": "GG88"
  },
  {
    "id": "lp_gg88_vip_2",
    "name": "GG88 CỔNG QUỐC TẾ UY TÍN HÀNG ĐẦU",
    "title": "GG88 CỔNG QUỐC TẾ UY TÍN HÀNG ĐẦU",
    "folder": "ldpape_4d",
    "path": "C:\\Landingpages\\GG88\\ldpape_4d",
    "gitRepo": "freze2212/lp-gg88-vip",
    "pagesProject": "lp-gg88-vip-2",
    "cnameTarget": "lp-gg88-vip-2.pages.dev",
    "sampleDomain": "gg88us.live",
    "sampleUrl": "https://gg88us.live",
    "totalDomains": 463,
    "brand": "GG88",
    "brandLabel": "GG88"
  },
  {
    "id": "lp_5h_gg88",
    "name": "Welcome to cổng quốc tế chính thức ☀ 2026️",
    "title": "Welcome to cổng quốc tế chính thức ☀ 2026️",
    "folder": "landingpage-5h-gg",
    "path": "C:\\Landingpages\\GG88\\landingpage-5h-gg",
    "pagesProject": "lp-5h-gg88",
    "cnameTarget": "lp-5h-gg88.pages.dev",
    "pagesAccountId": "ddead9accc534c1eb074d2a46fffe748",
    "sampleDomain": "lp-5h-gg88.pages.dev",
    "sampleUrl": "https://lp-5h-gg88.pages.dev",
    "totalDomains": 0,
    "brand": "GG88",
    "brandLabel": "GG88"
  },
  {
    "id": "lp_gg882pro",
    "name": "Welcome to cổng chính thức ☀️ 2026",
    "title": "Welcome to cổng chính thức ☀️ 2026",
    "folder": "ld-gg882pro",
    "path": "C:\\Landingpages\\GG88\\ld-gg882pro",
    "pagesProject": "lp-gg882pro-git2",
    "cnameTarget": "lp-gg882pro-git2.pages.dev",
    "sampleDomain": "gg8858.com",
    "sampleUrl": "https://www.gg8858.com",
    "totalDomains": 0,
    "brand": "GG88",
    "brandLabel": "GG88"
  },
  {
    "id": "gg88_lp_5uae",
    "name": "GG88 - LP 5 QUỐC GIA (5 UAE)",
    "title": "GG88 - LP 5 QUỐC GIA (5 UAE)",
    "folder": "ldpape_4d-5-quocgia",
    "path": "C:\\Landingpages\\GG88\\ldpape_4d-5-quocgia",
    "pagesProject": "gg88-lp-5uae",
    "cnameTarget": "gg88-lp-5uae.pages.dev",
    "sampleDomain": "g8fun.live",
    "sampleUrl": "https://g8fun.live",
    "totalDomains": 31,
    "brand": "GG88",
    "brandLabel": "GG88"
  },
  {
    "id": "lp_gg88pr",
    "name": "GG88 PR — lp-gg88pr",
    "title": "GG88 PR Landing Page (lp-gg88pr-git2)",
    "folder": "lp-gg88pr",
    "path": "C:\\Landingpages\\GG88\\lp-gg88pr",
    "gitRepo": "freze2212/lp-gg88pr",
    "pagesProject": "lp-gg88pr-git2",
    "cnameTarget": "lp-gg88pr-git2.pages.dev",
    "sampleDomain": "gg88pr.com",
    "sampleUrl": "https://gg88pr.com",
    "totalDomains": 1,
    "brand": "GG88",
    "brandLabel": "GG88"
  },
  {
    "id": "lp_gg88_gt9_sk",
    "name": "GG88 GT9 — Video SK (gg88sk.com)",
    "title": "GG88 GT9 — Video SK (gg88sk.com)",
    "folder": "lp-gg88-gt9-sk",
    "path": "C:\\Landingpages\\GG88\\lp-gg88-gt9-sk",
    "gitRepo": "freze2212/lp-gg88-gt9-sk",
    "pagesProject": "lp-gg88-gt9-sk",
    "cnameTarget": "lp-gg88-gt9-sk.pages.dev",
    "sampleDomain": "gg88sk.com",
    "sampleUrl": "https://gg88sk.com",
    "totalDomains": 1,
    "brand": "GG88",
    "brandLabel": "GG88"
  },
  {
    "id": "lp_1_page_gg88",
    "name": "GG88 - Trang Chủ Link Tổng (g8tong.com)",
    "title": "GG88 - Trang Chủ Link Tổng (g8tong.com)",
    "folder": "lp-1-page-gg88",
    "path": "C:\\Landingpages\\GG88\\lp-1-page-gg88",
    "pagesProject": "lp-1-page-gg88",
    "cnameTarget": "lp-1-page-gg88.pages.dev",
    "sampleDomain": "g8tong.com",
    "sampleUrl": "https://g8tong.com",
    "totalDomains": 1,
    "brand": "GG88",
    "brandLabel": "GG88"
  },
  {
    "id": "lp_1a_llwin_quocte",
    "name": "LLWIN CỔNG QUỐC TẾ UY TÍN HÀNG ĐẦU",
    "title": "LLWIN CỔNG QUỐC TẾ UY TÍN HÀNG ĐẦU",
    "folder": "lp-1A-llwin-quocte",
    "path": "C:\\Landingpages\\LLWIN\\lp-1A-llwin-quocte",
    "pagesProject": "lp-1a-llwin-quocte",
    "cnameTarget": "lp-1a-llwin-quocte.pages.dev",
    "sampleDomain": "kjctong.com",
    "sampleUrl": "https://kjctong.com",
    "totalDomains": 1,
    "brand": "LLWIN",
    "brandLabel": "LLWIN"
  },
  {
    "id": "lp_7f_xx88_games",
    "name": "XX88 GAMES // CỔNG LIÊN MINH KJC 2026",
    "title": "Welcome to ⭐ Cổng chính thức năm 2026",
    "folder": "lp-7f-xx88-games",
    "path": "C:\\Landingpages\\XX88\\lp-7f-xx88-games",
    "pagesProject": "lp-7f-xx88-games-git2",
    "cnameTarget": "lp-7f-xx88-games-git2.pages.dev",
    "sampleDomain": "xx88pro.us",
    "sampleUrl": "https://xx88pro.us",
    "totalDomains": 1,
    "brand": "XX88",
    "brandLabel": "XX88"
  },
  {
    "id": "lp_3c_gg88_fly88",
    "name": "// NEURAL_PORTAL :: INTL_GATEWAY_2026",
    "title": "// NEURAL_PORTAL :: INTL_GATEWAY_2026",
    "folder": "lp-3c-gg88-fly88",
    "path": "C:\\Landingpages\\GG88\\lp-3c-gg88-fly88",
    "pagesProject": "lp-3c-gg88-fly88",
    "cnameTarget": "lp-3c-gg88-fly88.pages.dev",
    "sampleDomain": "gg8us.top",
    "sampleUrl": "https://gg8us.top",
    "totalDomains": 1,
    "brand": "GG88",
    "brandLabel": "GG88"
  },
  {
    "id": "lp_xoamaan_6c_llwin",
    "name": "Tool Xoá Mã Ẩn Nhà Cái | Kích Hoạt RTP & Tắt Theo Dõi IP",
    "title": "Tool Xoá Mã Ẩn Nhà Cái | Kích Hoạt RTP & Tắt Theo Dõi IP",
    "folder": "lp-6c-xoamaan-llwin",
    "path": "C:\\Landingpages\\LLWIN\\lp-6c-xoamaan-llwin",
    "pagesProject": "lp-xoamaan-6c-llwin",
    "cnameTarget": "lp-xoamaan-6c-llwin.pages.dev",
    "sampleDomain": "lp-xoamaan-6c-llwin.pages.dev",
    "sampleUrl": "https://lp-xoamaan-6c-llwin.pages.dev",
    "totalDomains": 0,
    "brand": "LLWIN",
    "brandLabel": "LLWIN"
  },
  {
    "id": "lp_gg88_c168_qte",
    "name": "Welcome to cổng quốc tế chính thức ☀ 2026️",
    "title": "Welcome to cổng quốc tế chính thức ☀ 2026️",
    "folder": "lp-c168-qte",
    "path": "C:\\Landingpages\\LLWIN\\lp-c168-qte",
    "pagesProject": "lp-gg88-c168-qte",
    "cnameTarget": "lp-gg88-c168-qte.pages.dev",
    "sampleDomain": "32llwin.com",
    "sampleUrl": "https://32llwin.com",
    "totalDomains": 0,
    "brand": "LLWIN",
    "brandLabel": "LLWIN"
  },
  {
    "id": "lp_gg88_xoamaan",
    "name": "MULTI S.Y.S.T.E.M OVERRIDE V6.9",
    "title": "MULTI S.Y.S.T.E.M OVERRIDE V6.9",
    "folder": "lp-c168-xoamaan",
    "path": "C:\\Landingpages\\GG88\\lp-c168-xoamaan",
    "pagesProject": "lp-gg88-xoamaan",
    "cnameTarget": "lp-gg88-xoamaan.pages.dev",
    "sampleDomain": "lp-gg88-xoamaan.pages.dev",
    "sampleUrl": "https://lp-gg88-xoamaan.pages.dev",
    "totalDomains": 0,
    "brand": "GG88",
    "brandLabel": "GG88"
  },
  {
    "id": "lp_mm88_fly88",
    "name": "MM88 · Cổng Link Tổng MM88 2026",
    "title": "MM88 · Cổng Link Tổng MM88 2026",
    "folder": "lp-fly88-mm88",
    "path": "C:\\Landingpages\\MM88\\lp-fly88-mm88",
    "pagesProject": "lp-mm88-fly88",
    "cnameTarget": "lp-mm88-fly88.pages.dev",
    "pagesAccountId": "ddead9accc534c1eb074d2a46fffe748",
    "sampleDomain": "mm88top.cc",
    "sampleUrl": "https://mm88top.cc",
    "totalDomains": 16,
    "brand": "MM88",
    "brandLabel": "MM88"
  },
  {
    "id": "lp_gg88_fly88",
    "name": "GG88 · Cổng Link Tổng GG88 2026",
    "title": "GG88 · Cổng Link Tổng GG88 2026",
    "folder": "lp-gg88-fly88",
    "path": "C:\\Landingpages\\GG88\\lp-gg88-fly88",
    "pagesProject": "lp-gg88-fly88",
    "cnameTarget": "lp-gg88-fly88.pages.dev",
    "sampleDomain": "gg88en.com",
    "sampleUrl": "https://gg88en.com",
    "totalDomains": 22,
    "brand": "GG88",
    "brandLabel": "GG88"
  },
  {
    "id": "lp_7f_llwin_games",
    "name": "Welcome to ⭐ Cổng chính thức năm 2026",
    "title": "Welcome to ⭐ Cổng chính thức năm 2026",
    "folder": "lp-llwin-info",
    "path": "C:\\Landingpages\\LLWIN\\lp-llwin-info",
    "gitRepo": "freze2212/lp-7f-llwin-games",
    "pagesProject": "lp-7f-llwin-games",
    "cnameTarget": "lp-7f-llwin-games.pages.dev",
    "sampleDomain": "lltong86.com",
    "sampleUrl": "https://lltong86.com",
    "totalDomains": 11,
    "brand": "LLWIN",
    "brandLabel": "LLWIN"
  },
  {
    "id": "lp_7f_llwin_defr",
    "name": "LLWIN 7F · ĐỨC · PHÁP (Marina Bay)",
    "title": "Welcome to ⭐ Cổng LLWIN chính thức năm 2026",
    "folder": "lp-7f-llwin-defr",
    "path": "C:\\Landingpages\\LLWIN\\lp-7f-llwin-defr",
    "gitRepo": "freze2212/lp-7f-llwin-defr",
    "pagesProject": "lp-7f-llwin-defr",
    "cnameTarget": "lp-7f-llwin-defr.pages.dev",
    "sampleDomain": "appllwin.com",
    "sampleUrl": "https://appllwin.com",
    "totalDomains": 1,
    "brand": "LLWIN",
    "brandLabel": "LLWIN"
  },
  {
    "id": "lp_mm88_banner_qte",
    "name": "MM88 - Link Chính Thức Bảo Mật Cao",
    "title": "MM88 - Link Chính Thức Bảo Mật Cao",
    "folder": "lp-mm88-banner-qute",
    "path": "C:\\Landingpages\\MM88\\lp-mm88-banner-qute",
    "pagesProject": "lp-mm88-banner-qte",
    "cnameTarget": "lp-mm88-banner-qte.pages.dev",
    "sampleDomain": "lp-mm88-banner-qte.pages.dev",
    "sampleUrl": "https://lp-mm88-banner-qte.pages.dev",
    "totalDomains": 0,
    "brand": "MM88",
    "brandLabel": "MM88"
  },
  {
    "id": "lp_game_vip",
    "name": "CỔNG GAME QUỐC TẾ - ULTIMATE VIP",
    "title": "CỔNG GAME QUỐC TẾ - ULTIMATE VIP",
    "folder": "lp-mm88-dt88",
    "path": "C:\\Landingpages\\GG88\\lp-mm88-dt88",
    "pagesProject": "lp-game-vip",
    "cnameTarget": "lp-game-vip.pages.dev",
    "sampleDomain": "dt8386.cc",
    "sampleUrl": "https://dt8386.cc",
    "totalDomains": 3,
    "brand": "GG88",
    "brandLabel": "GG88"
  },
  {
    "id": "lp_uae_1_button",
    "name": "GG88 - NẠP 100 NHẬN TOOL XÓA MÃ ẨN",
    "title": "GG88 - NẠP 100 NHẬN TOOL XÓA MÃ ẨN",
    "folder": "tool",
    "path": "C:\\Landingpages\\GG88\\tool",
    "pagesProject": "lp-uae-1-button",
    "cnameTarget": "lp-uae-1-button.pages.dev",
    "sampleDomain": "gg88us.live",
    "sampleUrl": "https://gg88us.live",
    "totalDomains": 409,
    "brand": "GG88",
    "brandLabel": "GG88"
  },
  {
    "id": "lp_9d_xoaip_gg88",
    "name": "xoamagame",
    "title": "xoamagame",
    "folder": "lp-xoaipan-9d-g",
    "path": "C:\\Landingpages\\GG88\\lp-xoaipan-9d-g",
    "pagesProject": "lp-9d-xoaip-gg88",
    "cnameTarget": "lp-9d-xoaip-gg88.pages.dev",
    "pagesAccountId": "ddead9accc534c1eb074d2a46fffe748",
    "sampleDomain": "lp-9d-xoaip-gg88.pages.dev",
    "sampleUrl": "https://lp-9d-xoaip-gg88.pages.dev",
    "totalDomains": 0,
    "brand": "GG88",
    "brandLabel": "GG88"
  },
  {
    "id": "lp_xoatong_net",
    "name": "BLACKSITE CONSOLE - XÓA ID BẨN & KÍCH HOẠT MAXWIN",
    "title": "BLACKSITE CONSOLE - XÓA ID BẨN & KÍCH HOẠT MAXWIN",
    "folder": "LP-XOATONG.NET",
    "path": "C:\\Landingpages\\GG88\\LP-XOATONG.NET",
    "gitRepo": "freze2212/lp-xoatong.net",
    "pagesProject": "lp-xoatong-net",
    "cnameTarget": "lp-xoatong-net.pages.dev",
    "sampleDomain": "g88tong.net",
    "sampleUrl": "https://g88tong.net",
    "totalDomains": 4,
    "brand": "GG88",
    "brandLabel": "GG88"
  },
  {
    "id": "landingpage_5f_g",
    "name": "GG88 - CỔNG QUỐC TẾ 2026 - SINGAPORE (5F)",
    "title": "GG88 - Cổng Chính Thức 2026 - Singapore",
    "folder": "landing-page-5f",
    "path": "C:\\Landingpages\\GG88\\landing-page-5f",
    "gitRepo": "freze2212/landingpage-5f-g",
    "pagesProject": "landingpage-5f-g",
    "cnameTarget": "landingpage-5f-g.pages.dev",
    "pagesAccountId": "ddead9accc534c1eb074d2a46fffe748",
    "sampleDomain": "gg88am.com",
    "sampleUrl": "https://gg88am.com",
    "totalDomains": 20,
    "brand": "GG88",
    "brandLabel": "GG88"
  },
  {
    "id": "landingpage_5f_phi",
    "name": "GG88 - CỔNG QUỐC TẾ 2026 - PHILIPPINES (5F)",
    "title": "GG88 - Cổng Chính Thức 2026 - Philippines",
    "folder": "landing-page-5f-phi",
    "path": "C:\\Landingpages\\GG88\\landing-page-5f-phi",
    "gitRepo": "freze2212/landingpage-5f-phi",
    "pagesProject": "landingpage-5f-phi",
    "cnameTarget": "landingpage-5f-phi.pages.dev",
    "sampleDomain": "gg88phi.com",
    "sampleUrl": "https://gg88phi.com",
    "totalDomains": 1,
    "brand": "GG88",
    "brandLabel": "GG88"
  },
  {
    "id": "landingpage_5f_llwin",
    "name": "LLWIN - CỔNG QUỐC TẾ 2026 - SINGAPORE (5F)",
    "title": "LLWIN - Cổng Chính Thức 2026 - Singapore",
    "folder": "landing-page-5f",
    "path": "C:\\Landingpages\\LLWIN\\landing-page-5f",
    "gitRepo": "freze2212/lp-5f-llwin",
    "pagesProject": "lp-5f-llwin",
    "cnameTarget": "lp-5f-llwin.pages.dev",
    "sampleDomain": "llgc.uk",
    "sampleUrl": "https://llgc.uk",
    "totalDomains": 4,
    "brand": "LLWIN",
    "brandLabel": "LLWIN"
  },
  {
    "id": "lp_llwin_llwind_top",
    "name": "Welcome to cổng chính thức ☀️ 2026",
    "title": "Welcome to cổng chính thức ☀️ 2026",
    "folder": "lp-llwind.top",
    "path": "C:\\Landingpages\\LLWIN\\lp-llwind.top",
    "pagesProject": "lp-llwin-llwind-top",
    "cnameTarget": "lp-llwin-llwind-top.pages.dev",
    "sampleDomain": "llwind.top",
    "sampleUrl": "https://llwind.top",
    "totalDomains": 2,
    "brand": "LLWIN",
    "brandLabel": "LLWIN"
  },
  {
    "id": "lp_mm88sin_top",
    "name": "Welcome to cổng chính thức ☀️ 2026",
    "title": "Welcome to cổng chính thức ☀️ 2026",
    "folder": "lp-mm88sin.top",
    "path": "C:\\Landingpages\\MM88\\lp-mm88sin.top",
    "pagesProject": "lp-mm88sin-top",
    "cnameTarget": "lp-mm88sin-top.pages.dev",
    "sampleDomain": "mm88sin.top",
    "sampleUrl": "https://mm88sin.top",
    "totalDomains": 4,
    "brand": "MM88",
    "brandLabel": "MM88"
  },
  {
    "id": "lp_1a_xx88_quocte",
    "name": "XX88 CỔNG QUỐC TẾ UY TÍN HÀNG ĐẦU",
    "title": "XX88 CỔNG QUỐC TẾ UY TÍN HÀNG ĐẦU",
    "folder": "lp-1a-xx88-quocte",
    "path": "C:\\Landingpages\\XX88\\lp-1a-xx88-quocte",
    "gitRepo": "freze2212/lp-1a-xx88-quocte",
    "pagesProject": "lp-1a-xx88-quocte",
    "cnameTarget": "lp-1a-xx88-quocte.pages.dev",
    "sampleDomain": "lp-1a-xx88-quocte.pages.dev",
    "sampleUrl": "https://lp-1a-xx88-quocte.pages.dev",
    "totalDomains": 0,
    "brand": "XX88",
    "brandLabel": "XX88"
  },
  {
    "id": "lp_gg88_cong_gg88k",
    "name": "GG88 - CỔNG CHÍNH THỨC GG88K (Dubai · SG · TR)",
    "title": "GG88 - CỔNG CHÍNH THỨC GG88K (Dubai · SG · TR)",
    "folder": "lp-gg88-cong-gg88k",
    "path": "C:\\Landingpages\\GG88\\lp-gg88-cong-gg88k",
    "gitRepo": "freze2212/lp-gg88-cong-gg88k",
    "pagesProject": "lp-gg88-cong-gg88k",
    "cnameTarget": "lp-gg88-cong-gg88k.pages.dev",
    "sampleDomain": "gg88k.us",
    "sampleUrl": "https://gg88k.us",
    "totalDomains": 1,
    "brand": "GG88",
    "brandLabel": "GG88"
  },
  {
    "id": "landing_page_uae",
    "name": "GG88 - LANDING PAGE UAE (Admin Pages · Git)",
    "title": "GG88 - LANDING PAGE UAE (Admin Pages · Git)",
    "folder": "landing-page-uae",
    "path": "C:\\Landingpages\\GG88\\landing-page-uae",
    "gitRepo": "freze2212/landing-page-uae",
    "pagesProject": "landing-page-uae",
    "cnameTarget": "landing-page-uae.pages.dev",
    "pagesAccountId": "ddead9accc534c1eb074d2a46fffe748",
    "sampleDomain": "dangky88k.vip",
    "sampleUrl": "https://dangky88k.vip",
    "totalDomains": 158,
    "brand": "GG88",
    "brandLabel": "GG88"
  }
];

let cachedTemplates = ACTIVE_TEMPLATES;
let lastTemplatesReadTime = 0;

export function resolveTemplatePath(tPath, brand, folder) {
  if (!tPath) return tPath;
  if (fs.existsSync(tPath)) return tPath;
  const linuxPath = path.join("/var/www/Landingpages", brand || "", folder || path.basename(tPath));
  if (fs.existsSync(linuxPath)) return linuxPath;
  const linuxDirect = path.join("/var/www/Landingpages", path.basename(tPath));
  if (fs.existsSync(linuxDirect)) return linuxDirect;
  return tPath;
}

export function listTemplates() {
  try {
    const now = Date.now();
    if (now - lastTemplatesReadTime > 2000) {
      lastTemplatesReadTime = now;
      const thisFilePath = fileURLToPath(import.meta.url);
      const content = fs.readFileSync(thisFilePath, "utf8");
      const match = content.match(/export const ACTIVE_TEMPLATES = (\[[\s\S]*?\n\]);/);
      if (match) {
        const fn = new Function(`return ${match[1]};`);
        const parsed = fn();
        if (Array.isArray(parsed) && parsed.length > 0) {
          cachedTemplates = parsed;
        }
      }
    }
  } catch {}
  return cachedTemplates.map((t) => ({
    ...t,
    path: resolveTemplatePath(t.path, t.brand, t.folder),
  }));
}

export function getTemplate(idOrFolder) {
  const templates = listTemplates();
  if (!idOrFolder) return templates[0];
  const found = templates.find(
    (t) =>
      t.id?.toLowerCase() === idOrFolder.toLowerCase() ||
      t.folder?.toLowerCase() === idOrFolder.toLowerCase() ||
      t.pagesProject?.toLowerCase() === idOrFolder.toLowerCase()
  );
  return found || templates[0];
}

export function findTemplateByDomain(domain) {
  const norm = domain.trim().toLowerCase();
  const templates = listTemplates();
  for (const t of templates) {
    if (!t.path) continue;
    const djPath = path.join(t.path, "domains.json");
    if (fs.existsSync(djPath)) {
      try {
        const dj = JSON.parse(fs.readFileSync(djPath, "utf8"));
        if (norm in dj) return t;
      } catch {}
    }
  }
  return null;
}

const templateLocks = new Map();

function withTemplateLock(tplPath, fn) {
  const currentLock = templateLocks.get(tplPath) || Promise.resolve();
  const nextLock = currentLock.then(() => fn(), () => fn());
  templateLocks.set(tplPath, nextLock.catch(() => {}));
  return nextLock;
}

export async function updateTemplateDomainsJson(template, domain, mainUrl, messengerUrl = "", opts = {}) {
  const tplObj = typeof template === "string" ? (getTemplate(template) || { path: template }) : template;
  if (!tplObj?.path) throw new Error("Template không có đường dẫn thư mục nguồn");

  return withTemplateLock(tplObj.path, async () => {
    const djPath = path.join(tplObj.path, "domains.json");
    const norm = domain.trim().toLowerCase().replace(/^www\./, "");
    const teleUrl = messengerUrl || "";
    const entry = {
      main_url: mainUrl,
      messenger_url: teleUrl || mainUrl,
      telegram_url: teleUrl || undefined,
    };

    const gitDir = path.join(tplObj.path, ".git");
    if (!fs.existsSync(gitDir)) {
      throw new Error(
        `Template path thiếu .git — không push được GitHub/Pages. Path: ${tplObj.path}. Cần git clone đúng repo trước khi mua/đổi link.`
      );
    }

    // Đồng bộ domains.json với origin — KHÔNG bao giờ git reset --hard
    // (reset --hard sẽ mất domain khác / thay đổi local chưa push)
    try {
      const rebaseMerge = path.join(tplObj.path, ".git", "rebase-merge");
      const rebaseApply = path.join(tplObj.path, ".git", "rebase-apply");
      if (fs.existsSync(rebaseMerge) || fs.existsSync(rebaseApply)) {
        await execAsync(`git rebase --abort`, { cwd: tplObj.path }).catch(() => {});
      }
      await execAsync(`git fetch origin`, { cwd: tplObj.path });
      const showRef = await execAsync(`git show-ref`, { cwd: tplObj.path }).catch(() => ({ stdout: "" }));
      const refs = String(showRef.stdout || "");
      const pick = refs.includes("refs/remotes/origin/main")
        ? "origin/main"
        : refs.includes("refs/remotes/origin/master")
          ? "origin/master"
          : null;
      if (pick) {
        // Merge key từ remote domains.json vào file local (giữ hết domain 2 phía)
        let remoteObj = {};
        let localObj = {};
        try {
          const remoteDj = await execAsync(`git show ${pick}:domains.json`, { cwd: tplObj.path });
          remoteObj = JSON.parse(remoteDj.stdout || "{}");
        } catch {}
        if (fs.existsSync(djPath)) {
          try {
            localObj = JSON.parse(fs.readFileSync(djPath, "utf8"));
          } catch {}
        }
        const merged = { ...remoteObj, ...localObj };
        fs.writeFileSync(djPath, JSON.stringify(merged, null, 2), "utf8");
        // Cập nhật nhánh local với commit remote (merge, không hard reset)
        await execAsync(`git merge --no-edit -X ours ${pick}`, { cwd: tplObj.path }).catch(async () => {
          await execAsync(`git merge --abort`, { cwd: tplObj.path }).catch(() => {});
        });
      }
    } catch (syncErr) {
      throw new Error(`Không sync được origin trước khi ghi link: ${syncErr.message}`);
    }

    // Đọc domains.json SAU sync rồi ghi entry domain
    let dj = {};
    let isExisting = false;
    if (fs.existsSync(djPath)) {
      try {
        dj = JSON.parse(fs.readFileSync(djPath, "utf8"));
        if (norm in dj) isExisting = true;
      } catch {}
    }
    dj[norm] = entry;
    dj[`www.${norm}`] = entry;
    stripDomainsJsonFallbacks(dj);
    fs.writeFileSync(djPath, JSON.stringify(dj, null, 2), "utf8");

    const jsConfigRel = updateJsConfigFile(tplObj.path, norm, mainUrl, teleUrl);
    updateJsConfigFile(tplObj.path, `www.${norm}`, mainUrl, teleUrl);

    let gitPush = { ok: false, originOk: false, errors: [] };
    try {
      const commitMsg = isExisting ? `Update link & telegram for domain ${norm}` : `Auto add domain ${norm}`;
      const files = new Set(["domains.json"]);
      if (jsConfigRel) files.add(jsConfigRel);
      if (fs.existsSync(path.join(tplObj.path, "index.html"))) files.add("index.html");
      await execAsync(`git add ${[...files].join(" ")}`, { cwd: tplObj.path });
      await execAsync(`git commit -m "${commitMsg}"`, { cwd: tplObj.path }).catch(() => {});
      gitPush = await pushTemplateRemotes(tplObj.path);
    } catch (err) {
      gitPush.errors.push(err.message);
      throw new Error(`Git sync lỗi [${norm}]: ${err.message}`);
    }

    if (!gitPush.originOk) {
      throw new Error(
        `git push origin thất bại — live Pages chưa nhận [${norm}]. ${gitPush.errors.join(" | ")}`
      );
    }

    if (tplObj.pagesProject) {
      await deployToAllPagesInstances(tplObj.pagesProject, tplObj.path).catch((err) => {
        console.warn(`[Template] Deploy Pages lỗi:`, err.message);
      });
    }

    // Force deploy đúng project CNAME + verify live — tránh báo xong khi Pages queue kẹt
    let liveEnsure = null;
    if (opts.skipLiveEnsure !== true) {
      try {
        liveEnsure = await ensureLiveDomainLink(norm, mainUrl, {
          templatePath: tplObj.path,
          projectName: opts.pagesProject || null,
          cnameTarget: opts.cnameTarget || null,
          fallbackProject: tplObj.pagesProject || null,
          accountId: opts.accountId || tplObj.pagesAccountId || undefined,
          timeoutMs: opts.liveTimeoutMs ?? 90000,
        });
        if (!liveEnsure.ok) {
          console.warn(`[Template] Live chưa khớp sau force deploy [${norm}]:`, liveEnsure.error);
        }
      } catch (err) {
        liveEnsure = { ok: false, error: err.message };
        console.warn(`[Template] ensureLiveDomainLink lỗi [${norm}]:`, err.message);
      }
    }

    return {
      updated: true,
      path: djPath,
      isExisting,
      jsConfigUpdated: !!jsConfigRel,
      gitPush,
      liveEnsure,
    };
  });
}

/** Push theo thứ tự origin trước (Pages Git), rồi remote phụ. Thử rebase 1 lần nếu rejected. */
async function pushTemplateRemotes(cwd) {
  // Clear stuck rebase state if any
  const rebaseMerge = path.join(cwd, ".git", "rebase-merge");
  const rebaseApply = path.join(cwd, ".git", "rebase-apply");
  if (fs.existsSync(rebaseMerge) || fs.existsSync(rebaseApply)) {
    await execAsync(`git rebase --abort`, { cwd }).catch(() => {});
  }

  // Detect nhánh remote thật (master|main) — KHÔNG hardcode main
  let branch = "main";
  try {
    const showRef = await execAsync(`git show-ref`, { cwd });
    const refs = String(showRef.stdout || "");
    if (refs.includes("refs/remotes/origin/master")) branch = "master";
    else if (refs.includes("refs/remotes/origin/main")) branch = "main";
    else {
      branch = (await execAsync(`git rev-parse --abbrev-ref HEAD`, { cwd })).stdout.trim() || "main";
    }
  } catch {
    try {
      branch = (await execAsync(`git rev-parse --abbrev-ref HEAD`, { cwd })).stdout.trim() || "main";
    } catch {}
  }

  const remotes = await execAsync(`git remote`, { cwd }).catch(() => ({ stdout: "origin" }));
  const remoteList = remotes.stdout.trim().split(/\s+/).filter(Boolean);
  const ordered = [
    ...remoteList.filter((r) => r === "origin"),
    ...remoteList.filter((r) => r !== "origin"),
  ];
  if (ordered.length === 0) ordered.push("origin");

  const errors = [];
  let originOk = false;
  for (const r of ordered) {
    try {
      await execAsync(`git push ${r} HEAD:${branch}`, { cwd });
      if (r === "origin") originOk = true;
    } catch (e1) {
      try {
        await execAsync(`git pull --rebase ${r} ${branch}`, { cwd });
        await execAsync(`git push ${r} HEAD:${branch}`, { cwd });
        if (r === "origin") originOk = true;
      } catch (e2) {
        const msg = `${r}/${branch}: ${(e2.stderr || e2.message || "").toString().slice(0, 300)}`;
        errors.push(msg);
        console.warn(`[Template] git push ${r} ${branch} thất bại:`, msg);
        await execAsync(`git rebase --abort`, { cwd }).catch(() => {});
      }
    }
  }
  return { ok: errors.length === 0 || originOk, originOk, errors, branch };
}

export async function updateTemplateBatchDomains(template, domainEntries) {
  const tplObj = typeof template === "string" ? (getTemplate(template) || { path: template }) : template;
  if (!tplObj?.path) throw new Error("Template không có đường dẫn thư mục nguồn");
  if (!domainEntries || domainEntries.length === 0) return { updatedCount: 0 };

  return withTemplateLock(tplObj.path, async () => {
    const djPath = path.join(tplObj.path, "domains.json");
    let dj = {};
    if (fs.existsSync(djPath)) {
      try {
        dj = JSON.parse(fs.readFileSync(djPath, "utf8"));
      } catch {}
    }

    let hasJsConfig = false;
    let jsConfigRel = null;

    for (const item of domainEntries) {
      const norm = item.domain.trim().toLowerCase().replace(/^www\./, "");
      const mainUrl = item.link;
      const teleUrl = item.tele || "";
      const entry = {
        main_url: mainUrl,
        messenger_url: teleUrl || mainUrl,
        telegram_url: teleUrl || undefined,
      };
      dj[norm] = entry;
      dj[`www.${norm}`] = entry;

      const rel = updateJsConfigFile(tplObj.path, norm, mainUrl, teleUrl);
      updateJsConfigFile(tplObj.path, `www.${norm}`, mainUrl, teleUrl);
      if (rel) {
        hasJsConfig = true;
        jsConfigRel = rel;
      }
    }

    fs.writeFileSync(djPath, JSON.stringify(dj, null, 2), "utf8");

    const gitDir = path.join(tplObj.path, ".git");
    if (!fs.existsSync(gitDir)) {
      throw new Error(
        `Template path thiếu .git — không batch push được. Path: ${tplObj.path}`
      );
    }

    try {
      const commitMsg = `Auto batch add ${domainEntries.length} domains [${domainEntries.map((d) => d.domain).slice(0, 3).join(", ")}...]`;
      const filesToAdd = hasJsConfig && jsConfigRel ? `domains.json ${jsConfigRel}` : "domains.json";
      await execAsync(`git add ${filesToAdd}`, { cwd: tplObj.path });
      await execAsync(`git commit -m "${commitMsg}"`, { cwd: tplObj.path }).catch(() => {});
      const gitPush = await pushTemplateRemotes(tplObj.path);
      if (!gitPush.originOk) {
        throw new Error(`git push origin thất bại (batch). ${gitPush.errors.join(" | ")}`);
      }
    } catch (err) {
      throw new Error(`Batch git sync lỗi: ${err.message}`);
    }

    if (tplObj.pagesProject) {
      await deployToAllPagesInstances(tplObj.pagesProject, tplObj.path).catch((err) => {
        console.warn(`[Template] Batch deploy Pages lỗi:`, err.message);
      });
    }

    return { updatedCount: domainEntries.length, path: djPath };
  });
}
