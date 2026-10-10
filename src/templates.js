import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LANDING_ROOT } from "./utils.js";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { updateJsConfigFile } from "./repo-scanner.js";
import { stripDomainsJsonFallbacks, findDomainKeys, removeDomainKeys } from "./lp-link-patch.js";
import { deployToAllPagesInstances, ensureLiveDomainLink } from "./cloudflare.js";
import { config } from "./config.js";

const execAsync = promisify(exec);

function githubAuthEnv() {
  const token = config.github.token();
  if (!token) return { GIT_TERMINAL_PROMPT: "0" };
  return {
    GIT_TERMINAL_PROMPT: "0",
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "http.extraheader",
    GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString("base64")}`,
  };
}

function gitExec(cmd, cwd, { auth = false } = {}) {
  return execAsync(cmd, {
    cwd,
    env: { ...process.env, ...(auth ? githubAuthEnv() : { GIT_TERMINAL_PROMPT: "0" }) },
  });
}

// Danh sách các mẫu Landing Page CHUẨN HOẠT ĐỘNG (Verified Active on Cloudflare Pages)
export const ACTIVE_TEMPLATES = [
  {
    "id": "lp_llnewz",
    "name": "XOAMAAN - BẢO VỆ AN TOÀN TÀI KHOẢN",
    "title": "XOAMAAN - BẢO VỆ AN TOÀN TÀI KHOẢN",
    "folder": "lp-llnewz",
    "path": "C:\\Landingpages\\GG88\\lp-llnewz",
    "gitRepo": "freze2212/lp-llnewz",
    "pagesProject": "lp-llnewz",
    "cnameTarget": "lp-llnewz.pages.dev",
    "sampleDomain": "autocode.live",
    "sampleUrl": "https://autocode.live",
    "totalDomains": 1,
    "brand": "GG88",
    "brandLabel": "GG88"
  },
  {
    "id": "lp_gg88ny",
    "name": "Welcome to ⭐ Cổng chính thức năm 2026 (gg88ny)",
    "title": "Welcome to ⭐ Cổng chính thức năm 2026",
    "folder": "lp-gg88ny",
    "path": "C:\\Landingpages\\GG88\\lp-gg88ny",
    "gitRepo": "freze2212/lp-gg88ny",
    "pagesProject": "lp-gg88ny-git",
    "cnameTarget": "lp-gg88ny-git.pages.dev",
    "sampleDomain": "gg88hh.com",
    "sampleUrl": "https://gg88hh.com",
    "totalDomains": 1,
    "brand": "GG88",
    "brandLabel": "GG88"
  },
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
    "gitRepo": "freze2212/lp-5h-gg88",
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
    "gitRepo": "freze2212/lp-gg882pro",
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
    "gitRepo": "freze2212/gg88-lp-5uae",
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
    "gitRepo": "freze2212/lp-1-page-gg88",
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
    "gitRepo": "freze2212/lp-1a-llwin-quocte",
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
    "gitRepo": "freze2212/lp-7f-xx88-games",
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
    "gitRepo": "freze2212/lp-3c-gg88-fly88",
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
    "gitRepo": "freze2212/lp-xoamaan-6c-llwin",
    "pagesProject": "lp-xoamaan-6c-llwin",
    "cnameTarget": "lp-xoamaan-6c-llwin.pages.dev",
    "sampleDomain": "lp-xoamaan-6c-llwin.pages.dev",
    "sampleUrl": "https://lp-xoamaan-6c-llwin.pages.dev",
    "totalDomains": 0,
    "brand": "LLWIN",
    "brandLabel": "LLWIN"
  },
  {
    "id": "lp_xoamaan_mm88",
    "name": "Tool Xoá Mã Ẩn Nhà Cái | MM88",
    "title": "Tool Xoá Mã Ẩn Nhà Cái | Kích Hoạt RTP & Tắt Theo Dõi IP",
    "folder": "lp-xoamaan-mm88",
    "path": "C:\\Landingpages\\MM88\\lp-xoamaan-mm88",
    "gitRepo": "freze2212/lp-xoamaan-mm88",
    "pagesProject": "lp-xoamaan-mm88",
    "cnameTarget": "lp-xoamaan-mm88.pages.dev",
    "pagesAccountId": "456da4d89821d871fac09c0e5651338a",
    "sampleDomain": "xoamaanai.com",
    "sampleUrl": "https://xoamaanai.com",
    "totalDomains": 1,
    "brand": "MM88",
    "brandLabel": "MM88"
  },
  {
    "id": "lp_gg88_c168_qte",
    "name": "LLWIN — c168 Cổng quốc tế chính thức ☀ 2026",
    "title": "Welcome to cổng quốc tế chính thức ☀ 2026️",
    "folder": "lp-c168-qte",
    "path": "C:\\Landingpages\\LLWIN\\lp-c168-qte",
    "gitRepo": "freze2212/lp-gg88-c168-qte",
    "pagesProject": "lp-gg88-c168-qte",
    "cnameTarget": "lp-gg88-c168-qte.pages.dev",
    "pagesAccountId": "456da4d89821d871fac09c0e5651338a",
    "sampleDomain": "ggtop.us",
    "sampleUrl": "https://ggtop.us",
    "totalDomains": 2,
    "brand": "LLWIN",
    "brandLabel": "LLWIN"
  },
  {
    "id": "lp_gg88_c168",
    "name": "GG88BZ — Cổng quốc tế chính thức ☀ 2026",
    "title": "Welcome to cổng quốc tế chính thức ☀ 2026️",
    "folder": "lp-gg88-c168",
    "path": "C:\\Landingpages\\GG88\\lp-gg88-c168",
    "gitRepo": "freze2212/lp-gg88-c168",
    "pagesProject": "lp-gg88-c168",
    "cnameTarget": "lp-gg88-c168.pages.dev",
    "pagesAccountId": "456da4d89821d871fac09c0e5651338a",
    "sampleDomain": "lp-gg88-c168.pages.dev",
    "sampleUrl": "https://lp-gg88-c168.pages.dev",
    "totalDomains": 0,
    "brand": "GG88",
    "brandLabel": "GG88"
  },
  {
    "id": "lp_gg88_xoamaan",
    "name": "MULTI S.Y.S.T.E.M OVERRIDE V6.9",
    "title": "MULTI S.Y.S.T.E.M OVERRIDE V6.9",
    "folder": "lp-c168-xoamaan",
    "path": "C:\\Landingpages\\GG88\\lp-c168-xoamaan",
    "gitRepo": "freze2212/lp-gg88-xoamaan",
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
    "gitRepo": "freze2212/lp-mm88-fly88",
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
    "gitRepo": "freze2212/lp-gg88-fly88",
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
    "pagesProject": "lp-7f-llwin-defr-git",
    "cnameTarget": "lp-7f-llwin-defr-git.pages.dev",
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
    "gitRepo": "freze2212/lp-mm88-banner-qte",
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
    "gitRepo": "freze2212/lp-game-vip",
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
    "gitRepo": "freze2212/lp-uae-1-button",
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
    "gitRepo": "freze2212/lp-9d-xoaip-gg88",
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
    "gitRepo": "freze2212/lp-llwin-llwind.top",
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
    "gitRepo": "freze2212/lp-mm88sin-top",
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
    "id": "lp_mm88_5f",
    "name": "MM88 — CỔNG QUỐC TẾ 2026 SINGAPORE (5F clone)",
    "title": "MM88 - Cổng Chính Thức 2026 - Singapore",
    "folder": "lp-mm88-5f",
    "path": "C:\\Landingpages\\MM88\\lp-mm88-5f",
    "gitRepo": "freze2212/lp-mm88-5f",
    "pagesProject": "lp-mm88-5f-git",
    "cnameTarget": "lp-mm88-5f-git.pages.dev",
    "sampleDomain": "mmquocte.com",
    "sampleUrl": "https://mmquocte.com",
    "totalDomains": 1,
    "brand": "MM88",
    "brandLabel": "MM88"
  },
  {
    "id": "lp_mm88_u880",
    "name": "MM88 — U880 VIP (Đại Sứ)",
    "title": "MM88 - Đại Sứ Thương Hiệu Toàn Cầu",
    "folder": "lp-mm88-u880",
    "path": "C:\\Landingpages\\MM88\\lp-mm88-u880",
    "gitRepo": "freze2212/lp-mm88-u880",
    "pagesProject": "lp-mm88-u880-git",
    "cnameTarget": "lp-mm88-u880-git.pages.dev",
    "sampleDomain": "lp-mm88-u880-git.pages.dev",
    "sampleUrl": "https://lp-mm88-u880-git.pages.dev",
    "totalDomains": 0,
    "brand": "MM88",
    "brandLabel": "MM88"
  },
  {
    "id": "lp_xoamaan_to",
    "name": "GG88 — XOAMAAN.SITE (clone) → xoamaan.to",
    "title": "GG88 — XOAMAAN.SITE Landing",
    "folder": "lp-xoamaan-to",
    "path": "C:\\Landingpages\\GG88\\lp-xoamaan-to",
    "gitRepo": "freze2212/lp-xoamaan-to",
    "pagesProject": "lp-xoamaan-to-git",
    "cnameTarget": "lp-xoamaan-to-git.pages.dev",
    "sampleDomain": "xoamaan.to",
    "sampleUrl": "https://xoamaan.to",
    "totalDomains": 1,
    "brand": "GG88",
    "brandLabel": "GG88"
  },
  {
    "id": "lp_gg88_cd",
    "name": "GG88 CD — Trung Tâm Chuyển Đổi Link (no App DL)",
    "title": "GG88 CD — Trung Tâm Chuyển Đổi Link",
    "folder": "lp-gg88-cd",
    "path": "C:\\Landingpages\\GG88\\lp-gg88-cd",
    "gitRepo": "freze2212/lp-gg88-cd",
    "pagesProject": "lp-gg88-cd-git",
    "cnameTarget": "lp-gg88-cd-git.pages.dev",
    "sampleDomain": "gg88macao.com",
    "sampleUrl": "https://gg88macao.com",
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
  },
  {
    "id": "lp_xoamadoc",
    "name": "S.Y.S.T.E.M // OVERRIDE (xoamadoc)",
    "title": "S.Y.S.T.E.M // OVERRIDE",
    "folder": "lp-xoamadoc",
    "path": "C:\\Landingpages\\GG88\\lp-xoamadoc",
    "gitRepo": "freze2212/lp-xoamadoc",
    "pagesProject": "lp-xoamadoc",
    "cnameTarget": "lp-xoamadoc.pages.dev",
    "sampleDomain": "xoamadoc.top",
    "sampleUrl": "https://xoamadoc.top",
    "totalDomains": 1,
    "brand": "GG88",
    "brandLabel": "GG88"
  },
  {
    "id": "landingpage_xoamaan_4d",
    "name": "XOAMAAN 4D — xoamaan.uk",
    "title": "xoamagg",
    "folder": "landingpage-xoamaan-4d",
    "path": "C:\\Landingpages\\GG88\\landingpage-xoamaan-4d",
    "gitRepo": "freze2212/landingpage-xoamaan-4d",
    "pagesProject": "landingpage-xoamaan-4d",
    "cnameTarget": "landingpage-xoamaan-4d.pages.dev",
    "pagesAccountId": "ddead9accc534c1eb074d2a46fffe748",
    "sampleDomain": "xoamaan.uk",
    "sampleUrl": "https://xoamaan.uk",
    "totalDomains": 11,
    "brand": "GG88",
    "brandLabel": "GG88"
  },
  {
    "id": "lp_88vipqt",
    "name": "MM88 — Link độc quyền bảo mật cao (88vipqt)",
    "title": "MM88",
    "folder": "lp-88vipqt",
    "path": "C:\\Landingpages\\MM88\\lp-88vipqt",
    "gitRepo": "freze2212/lp-88vipqt",
    "pagesProject": "lp-88vipqt-git",
    "cnameTarget": "lp-88vipqt-git.pages.dev",
    "pagesAccountId": "456da4d89821d871fac09c0e5651338a",
    "sampleDomain": "88vipqt.com",
    "sampleUrl": "https://88vipqt.com",
    "totalDomains": 1,
    "brand": "MM88",
    "brandLabel": "MM88"
  },
  {
    "id": "lp_mm88_video5s",
    "name": "MM88 - VIDEO NỀN (PC & MB) TỰ CHUYỂN 5S",
    "title": "MM88 - VIDEO NỀN (PC & MB) TỰ CHUYỂN 5S",
    "folder": "lp-mm88-video5s",
    "path": "C:\\Landingpages\\MM88\\lp-mm88-video5s",
    "gitRepo": "freze2212/lp-mm88-video5s",
    "pagesProject": "lp-mm88-video5s",
    "cnameTarget": "lp-mm88-video5s.pages.dev",
    "sampleDomain": "mm88tqt.com",
    "sampleUrl": "https://mm88tqt.com",
    "totalDomains": 1,
    "brand": "MM88",
    "brandLabel": "MM88"
  }
];

let cachedTemplates = ACTIVE_TEMPLATES;
let lastTemplatesReadTime = 0;

export function resolveTemplatePath(tPath, brand, folder) {
  if (!tPath) return tPath;
  if (fs.existsSync(tPath)) return tPath;
  const linuxPath = path.join(LANDING_ROOT, brand || "", folder || path.basename(tPath));
  if (fs.existsSync(linuxPath)) return linuxPath;
  const linuxDirect = path.join(LANDING_ROOT, path.basename(tPath));
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
  if (!idOrFolder) return null;
  const key = String(idOrFolder).toLowerCase();
  return (
    templates.find(
      (t) =>
        t.id?.toLowerCase() === key ||
        t.folder?.toLowerCase() === key ||
        t.pagesProject?.toLowerCase() === key
    ) || null
  );
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
        if (findDomainKeys(dj, norm).length) return t;
      } catch {}
    }
  }
  return null;
}

const templateLocks = new Map();

/** Thư mục mẫu thiếu .git mà template có gitRepo: clone lại đúng repo, giữ bản cũ bên cạnh. */
export async function ensureTemplateGitCheckout(tplObj) {
  const dir = tplObj?.path;
  if (!dir) throw new Error("Template không có đường dẫn thư mục nguồn");
  if (fs.existsSync(path.join(dir, ".git"))) return { cloned: false, path: dir };

  const repo = String(tplObj.gitRepo || "").trim().replace(/^https:\/\/github\.com\//i, "").replace(/\.git$/i, "");
  if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    throw new Error(
      `Template path thiếu .git và template chưa khai báo gitRepo. Path: ${dir}. Cần git clone đúng repo trước khi mua/đổi link.`
    );
  }

  let target = dir;
  if (/^[A-Za-z]:\\/.test(dir) && process.platform !== "win32") {
    target = path.join(LANDING_ROOT, tplObj.brand || "", tplObj.folder || path.basename(dir.replace(/\\/g, "/")));
  }

  let backup = null;
  if (fs.existsSync(target)) {
    backup = `${target}.nogit-${Date.now()}`;
    fs.renameSync(target, backup);
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });

  try {
    await gitExec(`git clone https://github.com/${repo}.git "${target}"`, path.dirname(target), { auth: true });
  } catch (err) {
    if (backup && !fs.existsSync(target)) fs.renameSync(backup, target);
    const msg = String(err.stderr || err.message || err).replace(/AUTHORIZATION:[^\n]*/gi, "AUTHORIZATION: ***");
    throw new Error(`Template path thiếu .git, tự clone ${repo} thất bại: ${msg.slice(0, 300)}`);
  }

  console.log(`[Template] Đã clone ${repo} → ${target}${backup ? ` (bản cũ: ${backup})` : ""}`);
  return { cloned: true, path: target, backup };
}

/** Đưa thư mục mẫu về đúng bản origin rồi mới sửa. Không commit trên bản lệch. */
export async function alignRepoToOrigin(cwd) {
  await execAsync("git rebase --abort", { cwd }).catch(() => {});
  await execAsync("git merge --abort", { cwd }).catch(() => {});
  await gitExec("git fetch origin", cwd, { auth: true });
  const showRef = await execAsync("git show-ref", { cwd }).catch(() => ({ stdout: "" }));
  const refs = String(showRef.stdout || "");
  const branch = refs.includes("refs/remotes/origin/main")
    ? "main"
    : refs.includes("refs/remotes/origin/master")
      ? "master"
      : null;
  if (!branch) throw new Error("Repo không có origin/main");
  await execAsync(`git checkout -f -B ${branch} origin/${branch}`, { cwd });
  return branch;
}

export async function publishRepoChanges(cwd, { commitMsg, prepare, extraPaths = [] }) {
  let lastErr = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const branch = await alignRepoToOrigin(cwd);
      if (prepare) await prepare();
      const rels = [
        ...new Set(["domains.json", "data/domains.json", "config.js", "js/config.js", "index.html", "_redirects", ...extraPaths]),
      ].filter((rel) => fs.existsSync(path.join(cwd, rel)));
      if (rels.length) await execAsync(`git add -- ${rels.map((r) => `"${r}"`).join(" ")}`, { cwd });
      await execAsync("git add -u", { cwd });
      const st = await execAsync("git diff --cached --name-only", { cwd });
      if (String(st.stdout || "").trim()) {
        const safeMsg = String(commitMsg || "Update domain link").replace(/"/g, "'");
        await execAsync(`git commit -m "${safeMsg}"`, { cwd });
      }
      const gitPush = await pushTemplateRemotes(cwd, branch);
      if (gitPush.originOk) return gitPush;
      lastErr = gitPush.errors.join(" | ");
    } catch (err) {
      lastErr = err.message || String(err);
    }
  }
  throw new Error(lastErr || "git push origin thất bại");
}

function withTemplateLock(tplPath, fn) {
  const currentLock = templateLocks.get(tplPath) || Promise.resolve();
  const nextLock = currentLock.then(() => fn(), () => fn());
  templateLocks.set(tplPath, nextLock.catch(() => {}));
  return nextLock;
}

/** Đường dẫn file mẫu hợp lệ (tương đối, không thoát thư mục, không đụng .git / file ẩn). */
export function resolveTemplateFile(template, relFile) {
  const root = path.resolve(template.path);
  const rel = String(relFile || "").trim().replace(/\\/g, "/").replace(/^\/+/, "");
  if (!rel || /["`$]/.test(rel)) return null;
  const full = path.resolve(root, rel);
  const relToRoot = path.relative(root, full);
  if (!relToRoot || relToRoot.startsWith("..") || path.isAbsolute(relToRoot)) return null;
  if (relToRoot.split(/[\\/]/).some((seg) => seg.startsWith(".") || seg === "node_modules")) return null;
  return { full, rel: relToRoot.replace(/\\/g, "/") };
}

/** Lưu 1 file mẫu = commit + push lên origin (Pages build từ Git). Không push được thì báo lỗi. */
export async function saveTemplateFile(template, relFile, content) {
  const target = resolveTemplateFile(template, relFile);
  if (!target) throw new Error("Đường dẫn file không hợp lệ");
  return withTemplateLock(template.path, async () => {
    await ensureTemplateGitCheckout(template);
    return publishRepoChanges(template.path, {
      commitMsg: `Hub edit ${target.rel}`,
      extraPaths: [target.rel],
      prepare() {
        fs.mkdirSync(path.dirname(target.full), { recursive: true });
        fs.writeFileSync(target.full, String(content), "utf8");
      },
    });
  });
}

export async function updateTemplateDomainsJson(template, domain, mainUrl, messengerUrl = "", opts = {}) {
  const tplObj = typeof template === "string" ? (getTemplate(template) || { path: template }) : template;
  if (!tplObj?.path) throw new Error("Template không có đường dẫn thư mục nguồn");

  return withTemplateLock(tplObj.path, async () => {
    const checkout = await ensureTemplateGitCheckout(tplObj);
    if (checkout.path !== tplObj.path) tplObj.path = checkout.path;
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

    let isExisting = false;
    let jsConfigRel = null;
    let gitPush;
    const pushedAt = Date.now();
    try {
      gitPush = await publishRepoChanges(tplObj.path, {
        commitMsg: `Update link for domain ${norm}`,
        prepare() {
          let dj = {};
          if (fs.existsSync(djPath)) {
            try {
              dj = JSON.parse(fs.readFileSync(djPath, "utf8"));
            } catch {}
          }
          isExisting = findDomainKeys(dj, norm).length > 0;
          removeDomainKeys(dj, norm);
          dj[norm] = entry;
          dj[`www.${norm}`] = entry;
          stripDomainsJsonFallbacks(dj);
          fs.writeFileSync(djPath, JSON.stringify(dj, null, 2), "utf8");
          const dataDjPath = path.join(tplObj.path, "data", "domains.json");
          if (fs.existsSync(dataDjPath)) {
            try {
              const nested = JSON.parse(fs.readFileSync(dataDjPath, "utf8"));
              if (nested && typeof nested.domains === "object") {
                const prev = nested.domains[norm] && typeof nested.domains[norm] === "object" ? nested.domains[norm] : {};
                nested.domains[norm] = { ...prev, targetUrl: mainUrl };
                fs.writeFileSync(dataDjPath, JSON.stringify(nested, null, 2), "utf8");
              }
            } catch {}
          }
          jsConfigRel = updateJsConfigFile(tplObj.path, norm, mainUrl, teleUrl);
          updateJsConfigFile(tplObj.path, `www.${norm}`, mainUrl, teleUrl);
        },
      });
    } catch (err) {
      throw new Error(`git push origin thất bại — live Pages chưa nhận [${norm}]. ${err.message}`);
    }

    if (tplObj.pagesProject) {
      await deployToAllPagesInstances(tplObj.pagesProject, tplObj.path).catch((err) => {
        console.warn(`[Template] Deploy Pages lỗi:`, err.message);
      });
    }

    // Git push xong thì đợi domains.json live khớp. Không upload folder.
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
          sinceMs: pushedAt,
        });
        if (!liveEnsure.ok && !liveEnsure.pending) {
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

/** Push origin trước. Không rebase — commit đã nằm trên origin. */
async function pushTemplateRemotes(cwd, branch) {
  await execAsync("git rebase --abort", { cwd }).catch(() => {});
  await execAsync("git merge --abort", { cwd }).catch(() => {});

  if (!branch) {
    try {
      const showRef = await execAsync("git show-ref", { cwd });
      const refs = String(showRef.stdout || "");
      if (refs.includes("refs/remotes/origin/main")) branch = "main";
      else if (refs.includes("refs/remotes/origin/master")) branch = "master";
    } catch {}
    if (!branch) {
      try {
        branch = (await execAsync("git rev-parse --abbrev-ref HEAD", { cwd })).stdout.trim() || "main";
      } catch {
        branch = "main";
      }
    }
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
    if (r !== "origin" && !originOk) continue;
    try {
      const remoteUrl = await execAsync(`git remote get-url ${r}`, { cwd }).then((x) => x.stdout).catch(() => "");
      const auth = /github\.com/i.test(remoteUrl);
      await gitExec(`git push ${r} HEAD:${branch}`, cwd, { auth });
      if (r === "origin") originOk = true;
    } catch (e1) {
      const msg = `${r}/${branch}: ${(e1.stderr || e1.message || "").toString().slice(0, 300)}`;
      errors.push(msg);
      console.warn(`[Template] git push ${r} ${branch} thất bại:`, msg);
    }
  }
  return { ok: errors.length === 0 || originOk, originOk, errors, branch };
}

export async function updateTemplateBatchDomains(template, domainEntries) {
  const tplObj = typeof template === "string" ? (getTemplate(template) || { path: template }) : template;
  if (!tplObj?.path) throw new Error("Template không có đường dẫn thư mục nguồn");
  if (!domainEntries || domainEntries.length === 0) return { updatedCount: 0 };

  return withTemplateLock(tplObj.path, async () => {
    const checkout = await ensureTemplateGitCheckout(tplObj);
    if (checkout.path !== tplObj.path) tplObj.path = checkout.path;
    const djPath = path.join(tplObj.path, "domains.json");
    const gitDir = path.join(tplObj.path, ".git");
    if (!fs.existsSync(gitDir)) {
      throw new Error(
        `Template path thiếu .git — không batch push được. Path: ${tplObj.path}`
      );
    }

    try {
      const commitMsg = `Auto batch add ${domainEntries.length} domains [${domainEntries.map((d) => d.domain).slice(0, 3).join(", ")}...]`;
      await publishRepoChanges(tplObj.path, {
        commitMsg,
        prepare() {
          let dj = {};
          if (fs.existsSync(djPath)) {
            try {
              dj = JSON.parse(fs.readFileSync(djPath, "utf8"));
            } catch {}
          }
          for (const item of domainEntries) {
            const norm = item.domain.trim().toLowerCase().replace(/^www\./, "");
            const mainUrl = item.link;
            const teleUrl = item.tele || "";
            const entry = {
              main_url: mainUrl,
              messenger_url: teleUrl || mainUrl,
              telegram_url: teleUrl || undefined,
            };
            removeDomainKeys(dj, norm);
            dj[norm] = entry;
            dj[`www.${norm}`] = entry;
            updateJsConfigFile(tplObj.path, norm, mainUrl, teleUrl);
            updateJsConfigFile(tplObj.path, `www.${norm}`, mainUrl, teleUrl);
          }
          stripDomainsJsonFallbacks(dj);
          fs.writeFileSync(djPath, JSON.stringify(dj, null, 2), "utf8");
        },
      });
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
