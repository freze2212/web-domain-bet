import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { config } from "./config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import {
  deployToAllPagesInstances,
  findZoneByName,
  getOrCreateZone,
  updateOrCreatePageRule,
  deleteForwardingPageRules,
  findActiveForwardingRule,
  cfRequest,
  addPagesDomain,
  removeDomainFromAllPagesProjects,
} from "./cloudflare.js";
import { ACTIVE_TEMPLATES, updateTemplateDomainsJson, getTemplate } from "./templates.js";
import { getHistory, addHistoryItem, updateHistoryItem, getLastDomainHistoryMeta } from "./history.js";
import { verifyHistoryItem } from "./verifier.js";
import { normalizeDomain, normalizeUrl } from "./utils.js";

const execAsync = promisify(exec);

export const SEARCH_ROOTS = [
  "C:\\Landingpages",
  "/var/www/Landingpages",
  "/var/www/web-ten-mien/Landingpages",
  "C:\\Landingpage",
  "C:\\GG88",
  "C:\\LLWIN",
  "C:\\MM88",
  "C:\\RR88",
  "C:\\ALO8",
  "C:\\XX88",
  "C:\\FREZE-PRJ",
  "C:\\Users\\daodu\\Desktop",
  "C:\\Users\\daodu\\Downloads",
];

export function detectBrandFromDomain(domain = "") {
  const norm = (domain || "").toLowerCase();
  if (norm.includes("gg88") || norm.startsWith("gg")) return "GG88";
  if (norm.includes("llwin") || norm.startsWith("ll")) return "LLWIN";
  if (norm.includes("mm88") || norm.startsWith("mm")) return "MM88";
  if (norm.includes("rr88") || norm.startsWith("rr")) return "RR88";
  if (norm.includes("xx88") || norm.startsWith("xx")) return "XX88";
  if (norm.includes("alo8") || norm.startsWith("alo")) return "ALO8";
  if (norm.includes("789")) return "789BET";
  if (norm.includes("ok9")) return "OK9";
  if (norm.includes("mb66")) return "MB66";
  if (norm.includes("shbet")) return "SHBET";
  return "KHAC";
}

// Helper: Ánh xạ chuẩn từ folder nguồn sang tên dự án Cloudflare Pages
export function getPagesProjectForFolder(folderPath) {
  if (!folderPath) return "lp-gg88-vip-2";
  const normParts = folderPath.split(/[\\/]/).filter(Boolean).map((x) => x.toLowerCase());
  const folderSub = normParts.slice(-2).join("/");
  const folderName = path.basename(folderPath).toLowerCase();

  // 1. Tìm trong ACTIVE_TEMPLATES theo subpath chính xác (Ví dụ: llwin/landing-page-5f vs gg88/landing-page-5f)
  for (const t of ACTIVE_TEMPLATES) {
    if (t.path) {
      const tParts = t.path.split(/[\\/]/).filter(Boolean).map((x) => x.toLowerCase());
      const tSub = tParts.slice(-2).join("/");
      if (tSub === folderSub) {
        return t.pagesProject;
      }
    }
  }

  // 1b. Fallback theo folder name đơn lẻ nếu không trùng subpath
  for (const t of ACTIVE_TEMPLATES) {
    if (t.folder && t.folder.toLowerCase() === folderName) {
      return t.pagesProject;
    }
  }

  // 2. Kiểm tra .git/config
  const gitConfig = path.join(folderPath, ".git", "config");
  if (fs.existsSync(gitConfig)) {
    try {
      const c = fs.readFileSync(gitConfig, "utf8");
      const m = c.match(/url\s*=\s*.*?\/([^/]+?)(?:\.git)?\s*$/m);
      if (m && m[1]) return m[1].trim();
    } catch {}
  }

  // 3. Fallbacks cho các folder đặc biệt
  const specialMap = {
    "tool": "lp-uae-1-button",
    "ldpape_4d": "lp-gg88-vip-2",
    "ld-gg882pro": "lp-gg882pro",
    "3f-thanhnhan": "ladpage-3f-nhannhan",
    "landing-xoamaan-5f": "lp-xoamaan-4a-llwin",
    "landingpage-5h-gg": "lp-5h-gg88",
    "landingpage-xoamaan-4d": "landingpage-xoamaan-4d",
    "ldpape_4d-5-quocgia": "gg88-lp-5uae",
    "lp-1-page-gg88": "lp-1-page-gg88",
    "lp-xoaipan-9d-g": "lp-9d-xoaip-gg88",
    "landing-page-5f": "landingpage-5f-gg88",
    "lp-c168-xoamaan": "lp-gg88-xoamaan",
    "lp-3c-gg88-fly88": "lp-3c-gg88-fly88",
    "lp-gg88-fly88": "lp-gg88-fly88",
    "lp-mm88-dt88": "lp-game-vip",
    "lp-xoatong.net": "lp-xoatong-net",
  };

  if (specialMap[folderName]) {
    return specialMap[folderName];
  }

  return folderName;
}

// 1. Quét tìm toàn bộ các file domains.json trên máy
export function getAllDomainsJsonFiles() {
  const files = [];
  function scan(dir, depth = 0) {
    if (depth > 5) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const ent of entries) {
        if (
          ent.isDirectory() &&
          !["node_modules", ".git", "dist", "build", "screenshots", "backups"].includes(ent.name)
        ) {
          scan(path.join(dir, ent.name), depth + 1);
        } else if (ent.name === "domains.json") {
          files.push(path.join(dir, ent.name));
        }
      }
    } catch {}
  }
  SEARCH_ROOTS.forEach((r) => {
    if (fs.existsSync(r)) scan(r);
  });
  return files;
}

// 2. Tìm chính xác domain nằm ở folder gốc / repo nào
export function findDomainInRepos(domain) {
  const norm = domain.trim().toLowerCase();
  const allFiles = getAllDomainsJsonFiles();
  const matches = [];

  for (const f of allFiles) {
    try {
      const dj = JSON.parse(fs.readFileSync(f, "utf8"));
      if (norm in dj || `www.${norm}` in dj) {
        matches.push({
          filePath: f,
          folderPath: path.dirname(f),
          config: dj[norm] || dj[`www.${norm}`],
        });
      }
    } catch {}
  }
  return matches;
}

// 3. Kiểm tra domain thuộc tài khoản Cloudflare chính đã cấu hình
export async function checkDomainCfAccount(domain) {
  const norm = domain.trim().toLowerCase();
  const token = config.cloudflare.token();
  const accountId = config.cloudflare.accountId();
  if (!token || !accountId) {
    return {
      accountName: "Thiếu cấu hình Cloudflare",
      accountId: null,
      zone: null,
      token: null,
    };
  }
  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/zones?name=${encodeURIComponent(norm)}&account.id=${encodeURIComponent(accountId)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await res.json();
    if (data.success && data.result?.length > 0) {
      return {
        accountName: "Freze (Primary)",
        accountId,
        zone: data.result[0],
        token,
      };
    }
  } catch {}

  return {
    accountName: "Chưa cấu hình trên Cloudflare",
    accountId: null,
    zone: null,
    token: null,
  };
}

// Helper cập nhật file config.js hoặc js/config.js nếu có trong repo
function updateObjectSection(code, sectionName, key, value) {
  const regex = new RegExp(`(${sectionName}\\s*:\\s*\\{)([\\s\\S]*?)(\\n\\s*\\})`, "i");
  const match = code.match(regex);
  if (!match) return { code, changed: false };

  const prefix = match[1];
  let content = match[2];
  const suffix = match[3];

  const keyRegex = new RegExp(`(["'])${key}\\1\\s*:\\s*["'][^"']*["'],?`, "i");
  if (keyRegex.test(content)) {
    content = content.replace(keyRegex, `"${key}": "${value}",`);
  } else {
    content = `\n    "${key}": "${value}",` + content;
  }

  return {
    code: code.replace(regex, `${prefix}${content}${suffix}`),
    changed: true,
  };
}

export function updateJsConfigFile(folderPath, domain, newLink, newTele) {
  const norm = domain.trim().toLowerCase();
  const possiblePaths = [
    { full: path.join(folderPath, "js", "config.js"), rel: "js/config.js" },
    { full: path.join(folderPath, "config.js"), rel: "config.js" },
    { full: path.join(folderPath, "js", "dev.js"), rel: "js/dev.js" },
  ];

  let updatedRelPath = null;

  for (const item of possiblePaths) {
    if (!fs.existsSync(item.full)) continue;

    try {
      let code = fs.readFileSync(item.full, "utf8");
      let changed = false;

      // Pattern 1: linksByDomain & telegramByDomain
      if (newLink && code.includes("linksByDomain")) {
        const res = updateObjectSection(code, "linksByDomain", norm, newLink);
        if (res.changed) {
          code = res.code;
          changed = true;
        }
      }

      if (newTele && code.includes("telegramByDomain")) {
        const res = updateObjectSection(code, "telegramByDomain", norm, newTele);
        if (res.changed) {
          code = res.code;
          changed = true;
        }
      }

      // Pattern 1b: LINK_CONFIG.domains & LINK_CONFIG.default
      if (newLink && (code.includes("LINK_CONFIG") || code.includes("domains:"))) {
        const res = updateObjectSection(code, "domains", norm, newLink);
        if (res.changed) {
          code = res.code;
          changed = true;
        }
        const resWww = updateObjectSection(code, "domains", `www.${norm}`, newLink);
        if (resWww.changed) {
          code = resWww.code;
          changed = true;
        }
        code = code.replace(/default\s*:\s*["'][^"']*["']/g, `default: "${newLink}"`);
        changed = true;
      }

      // Pattern 2: DOMAIN_CONFIG
      if (code.includes("DOMAIN_CONFIG")) {
        if (newLink) {
          const domainBlockPattern = new RegExp(`(["'])${norm}\\1\\s*:\\s*\\{[^}]*\\}`, "gi");
          const blockContent = `"${norm}": {\n    register: "${newLink}",\n  }`;
          if (domainBlockPattern.test(code)) {
            code = code.replace(domainBlockPattern, blockContent);
          } else {
            code = code.replace(/DOMAIN_CONFIG\s*=\s*\{/, `DOMAIN_CONFIG = {\n  ${blockContent},`);
          }
          changed = true;
        }
      }

      // Pattern 3: configList array
      if (code.includes("configList")) {
        if (newLink) {
          const itemPattern = new RegExp(`\\{\\s*domain:\\s*['"]${norm}['"][^}]*\\}`, "gi");
          const newItem = `{\n    domain: '${norm.toUpperCase()}',\n    brand: 'GG88',\n    gameUrl: '${newLink}'\n  }`;
          if (itemPattern.test(code)) {
            code = code.replace(itemPattern, newItem);
          } else {
            code = code.replace(/const configList\s*=\s*\[/, `const configList = [\n  ${newItem},`);
          }
          changed = true;
        }
      }

      // Pattern 4: window.SITE_CONFIG & dynamic domains.json fetch
      if (newLink && (code.includes("SITE_CONFIG") || code.includes("REDIRECT_URL"))) {
        code = code.replace(/defaultLink\s*:\s*["'][^"']*["']/g, `defaultLink: ""`);
        code = code.replace(/registerUrl\s*:\s*["'][^"']*["']/g, `registerUrl: ""`);
        code = code.replace(/REDIRECT_URL\s*=\s*["'][^"']*["']/g, `REDIRECT_URL = ""`);
        code = code.replace(/getTargetUrl\(\)\s*\{\s*return\s*window\.REDIRECT_URL\s*\|\|\s*["'][^"']*["']/g, `getTargetUrl() { return window.REDIRECT_URL || ""`);
        changed = true;
      }

      // Ensure dynamic domains.json fetch exists without fallback
      if (!code.includes("fetch('/domains.json')") && !code.includes('fetch("/domains.json")')) {
        code += `\n// Dynamic real-time sync (No fallback)\n(function(){try{fetch('/domains.json').then(function(r){return r.json();}).then(function(d){if(!d)return;var h=(window.location.hostname||'').toLowerCase();var nh=h.replace(/^www\\./,'');var e=d[h]||d[nh];if(e){var u=e.main_url||e.url||e.link||(typeof e==='string'?e:'');if(u){window.REDIRECT_URL=u;var l=document.querySelectorAll('a.redirect-link,a.btn-register,a.cta-btn');for(var i=0;i<l.length;i++){l[i].href=u;}}}}).catch(function(){});}catch(e){}})();\n`;
        changed = true;
      }

      if (changed) {
        fs.writeFileSync(item.full, code, "utf8");
        updatedRelPath = item.rel;
      }
    } catch (err) {
      console.error(`Lỗi cập nhật ${item.full}:`, err.message);
    }
  }

  // Cập nhật thêm _redirects nếu có
  const redPath = path.join(folderPath, "_redirects");
  if (fs.existsSync(redPath) && newLink) {
    try {
      let redContent = fs.readFileSync(redPath, "utf8");
      redContent = redContent.replace(/\/reg\s+https?:\/\/[^\s]+/g, `/reg ${newLink}`);
      fs.writeFileSync(redPath, redContent, "utf8");
    } catch {}
  }

  // Cập nhật 07124351/index.html nếu có
  const subHtml = path.join(folderPath, "07124351", "index.html");
  if (fs.existsSync(subHtml) && newLink) {
    try {
      let h = fs.readFileSync(subHtml, "utf8");
      h = h.replace(/https:\/\/(?:www\.)?gg88\d+\.com[^\s"']*/g, newLink);
      fs.writeFileSync(subHtml, h, "utf8");
    } catch {}
  }

  return updatedRelPath;
}

// 4. Cập nhật link & telegram chuẩn xác CHỈ tại các folder gốc đang chứa domain đó
export async function updateDomainInExactRepos(domain, newLink, newTele = "") {
  const norm = domain.trim().toLowerCase();
  const matches = findDomainInRepos(norm);

  if (matches.length === 0) {
    return {
      success: false,
      error: `Tên miền [${domain}] KHÔNG tồn tại trong bất kỳ folder source Landing Page nào! Không thể tự ý thêm bừa bãi.`,
      updatedRepos: [],
    };
  }

  const updatedRepos = [];
  for (const m of matches) {
    try {
      const dj = JSON.parse(fs.readFileSync(m.filePath, "utf8"));
      const existing = typeof dj[norm] === "object" ? dj[norm] : {};
      
      const mainUrl = newLink || existing.main_url || existing.url || "";
      const teleUrl = newTele || existing.telegram_url || existing.tele || (newTele ? newTele : (existing.messenger_url && existing.messenger_url !== mainUrl ? existing.messenger_url : ""));

      const entry = {
        main_url: mainUrl,
        messenger_url: teleUrl || mainUrl,
        telegram_url: teleUrl || undefined,
      };
      dj[norm] = entry;
      dj[`www.${norm}`] = entry;
      fs.writeFileSync(m.filePath, JSON.stringify(dj, null, 2), "utf8");

      // Cập nhật js/config.js hoặc config.js nếu có
      const jsConfigRel = updateJsConfigFile(m.folderPath, norm, mainUrl, teleUrl);
      updateJsConfigFile(m.folderPath, `www.${norm}`, mainUrl, teleUrl);

      // Git commit & push: Tự động nhận diện nhánh hiện tại (main/master)
      const gitDir = path.join(m.folderPath, ".git");
      let gitPushed = false;
      if (fs.existsSync(gitDir)) {
        try {
          let currentBranch = "main";
          try {
            const bRes = await execAsync("git branch --show-current", { cwd: m.folderPath });
            if (bRes.stdout.trim()) currentBranch = bRes.stdout.trim();
          } catch {}

          await execAsync(`git add . && git commit -m "Update link & telegram for ${norm}"`, { cwd: m.folderPath }).catch(() => {});
          await execAsync(`git push origin ${currentBranch}`, { cwd: m.folderPath });
          gitPushed = true;
        } catch (gitErr) {
          console.warn(`[Git] Lỗi push tại ${m.folderPath}:`, gitErr.message);
        }
      }

      // Tự động deploy mã nguồn lên đúng Cloudflare Pages project
      const projectName = getPagesProjectForFolder(m.folderPath);
      console.log(`[Deploy] Deploying ${m.folderPath} to Cloudflare Pages project [${projectName}]...`);
      await deployToAllPagesInstances(projectName, m.folderPath).catch((err) => {
        console.warn(`[Deploy] Deploy warning for ${projectName}:`, err.message);
      });

      updatedRepos.push({
        folderPath: m.folderPath,
        filePath: m.filePath,
        projectName,
        gitPushed,
        jsConfigUpdated: !!jsConfigRel,
      });
    } catch (err) {
      console.error(`Lỗi cập nhật file ${m.filePath}:`, err.message);
    }
  }

  return {
    success: true,
    domain: norm,
    newLink,
    newTele,
    updatedRepos,
  };
}

// 5. Xoá domain khỏi một repo cụ thể
export async function removeDomainFromRepo(domain, folderOrFilePath) {
  const norm = domain.trim().toLowerCase().replace(/^www\./, "");
  const variants = [norm, `www.${norm}`];
  const filePath = folderOrFilePath.endsWith("domains.json")
    ? folderOrFilePath
    : path.join(folderOrFilePath, "domains.json");

  const folderPath = path.dirname(filePath);

  if (fs.existsSync(filePath)) {
    try {
      const dj = JSON.parse(fs.readFileSync(filePath, "utf8"));
      let changed = false;
      for (const key of variants) {
        if (key in dj) {
          delete dj[key];
          changed = true;
        }
      }
      if (changed) {
        fs.writeFileSync(filePath, JSON.stringify(dj, null, 2), "utf8");
      }
    } catch (err) {
      console.error(`Lỗi xoá domain ${norm} khỏi ${filePath}:`, err.message);
    }
  }

  // Xoá domain khỏi config.js / js/config.js nếu có
  const possiblePaths = [
    { full: path.join(folderPath, "js", "config.js"), rel: "js/config.js" },
    { full: path.join(folderPath, "config.js"), rel: "config.js" },
  ];
  let configRelCleaned = null;

  for (const item of possiblePaths) {
    if (!fs.existsSync(item.full)) continue;
    try {
      let code = fs.readFileSync(item.full, "utf8");
      let changed = false;
      for (const key of variants) {
        const linePattern = new RegExp(`^.*["']${key.replace(/\./g, "\\.")}["'].*$\\r?\\n?`, "gmi");
        if (linePattern.test(code)) {
          code = code.replace(linePattern, "");
          changed = true;
        }
      }
      if (changed) {
        fs.writeFileSync(item.full, code, "utf8");
        configRelCleaned = item.rel;
      }
    } catch {}
  }

  const gitDir = path.join(folderPath, ".git");
  if (fs.existsSync(gitDir)) {
    try {
      const filesToAdd = configRelCleaned ? `domains.json ${configRelCleaned}` : "domains.json";
      await execAsync(
        `git add ${filesToAdd} && git commit -m "Remove domain ${norm}" && git push origin main`,
        { cwd: folderPath }
      );
    } catch {}
  }
  return true;
}

// 6. Quét và tổng hợp tất cả domains từ mọi repo & lịch sử triển khai
export function listAllDomains() {
  const allFiles = getAllDomainsJsonFiles();
  const domainMap = new Map();

  // A. Quét từ tất cả file domains.json trong các folder mã nguồn
  for (const f of allFiles) {
    try {
      const dj = JSON.parse(fs.readFileSync(f, "utf8"));
      const folder = path.dirname(f);
      const folderName = path.basename(folder);

      for (const [dom, conf] of Object.entries(dj)) {
        const norm = dom.trim().toLowerCase();
        if (!norm) continue;

        const mainUrl = conf.main_url || conf.url || conf.link || (typeof conf === "string" ? conf : "");
        const messengerUrl = conf.messenger_url || conf.telegram_url || conf.tele || mainUrl;
        const telegramUrl = conf.telegram_url || conf.tele || (messengerUrl !== mainUrl ? messengerUrl : "");

        if (!domainMap.has(norm)) {
          domainMap.set(norm, {
            domain: norm,
            mainUrl,
            messengerUrl,
            telegramUrl,
            repos: [folder],
            filePaths: [f],
            primaryFolder: folderName,
            folderPath: folder,
            sourceType: "landing_page",
          });
        } else {
          const existing = domainMap.get(norm);
          if (!existing.repos.includes(folder)) {
            existing.repos.push(folder);
            existing.filePaths.push(f);
          }
          if (!existing.mainUrl && mainUrl) {
            existing.mainUrl = mainUrl;
            existing.messengerUrl = messengerUrl;
            existing.telegramUrl = telegramUrl;
          }
        }
      }
    } catch {}
  }

  // B. Quét gộp từ Lịch Sử Triển Khai (Bao gồm 302 Redirect, Deploy, Mua miền...)
  try {
    const history = getHistory();
    for (const h of history) {
      const norm = (h.domain || "").trim().toLowerCase();
      if (!norm || norm === "n/a") continue;

      const is302 = h.actionType?.includes("302");
      if (!domainMap.has(norm)) {
        domainMap.set(norm, {
          domain: norm,
          mainUrl: h.link || "",
          messengerUrl: h.tele || h.link || "",
          telegramUrl: h.tele || "",
          repos: [],
          filePaths: [],
          primaryFolder: is302 ? "302 Direct Redirect" : (h.templateName || "Cloudflare"),
          folderPath: "",
          sourceType: is302 ? "redirect_302" : "history",
          actionType: h.actionType || "HISTORY",
          cfAccount: h.cfAccount,
          liveStatus: h.liveStatus,
        });
      } else {
        const existing = domainMap.get(norm);
        if (!existing.mainUrl && h.link) {
          existing.mainUrl = h.link;
        }
        if (!existing.telegramUrl && h.tele) {
          existing.telegramUrl = h.tele;
        }
        if (h.liveStatus && !existing.liveStatus) {
          existing.liveStatus = h.liveStatus;
        }
      }
    }
  } catch {}

  // C. Quét gộp từ Toàn Bộ Cloudflare Zones (1,250+ tên miền)
  try {
    const cfCachePath = path.resolve(__dirname, "../data/cf_zones_cache.json");
    if (fs.existsSync(cfCachePath)) {
      const cfZones = JSON.parse(fs.readFileSync(cfCachePath, "utf8"));
      for (const z of cfZones) {
        const norm = (z.name || "").trim().toLowerCase();
        if (!norm) continue;

        const isFreze = z.accountName?.toLowerCase().includes("freze");
        const accountLabel = isFreze ? "Cloudflare (Freze)" : "Cloudflare (Admin)";

        if (!domainMap.has(norm)) {
          domainMap.set(norm, {
            domain: norm,
            mainUrl: "",
            messengerUrl: "",
            telegramUrl: "",
            repos: [],
            filePaths: [],
            primaryFolder: accountLabel,
            folderPath: "",
            sourceType: "cloudflare",
            actionType: "CLOUDFLARE",
            cfAccount: z.accountName,
            status: z.status,
            zoneId: z.id,
          });
        } else {
          const existing = domainMap.get(norm);
          if (!existing.cfAccount && z.accountName) {
            existing.cfAccount = z.accountName;
          }
          if (!existing.zoneId && z.id) {
            existing.zoneId = z.id;
          }
        }
      }
    }
  } catch (err) {
    console.warn("Lỗi nạp cf_zones_cache.json:", err.message);
  }

  return Array.from(domainMap.values()).sort((a, b) => a.domain.localeCompare(b.domain));
}

// 7. Hàm thông minh: Tự nhận diện Landing Page hay 302 Redirect và đổi link chuẩn xác
export async function smartSetLink(rawDomain, rawLink, rawTele = "", actor = {}) {
  const domain = normalizeDomain(rawDomain);
  const link = normalizeUrl(rawLink);
  const tele = rawTele ? rawTele.trim() : "";
  const prev = getLastDomainHistoryMeta(domain);
  const actorFields = {
    userId: actor.userId || null,
    username: actor.username || null,
    fullName: actor.fullName || null,
    previousLink: prev?.link || null,
    previousTemplateId: prev?.templateId || null,
    previousTemplateName: prev?.templateName || null,
    tele,
  };

  const cfInfo = await checkDomainCfAccount(domain).catch(() => ({ accountName: "Chưa rõ", token: null, zone: null, accountId: null }));

  // LIVE TRUTH: Page Rule 302 active → 302; else CNAME pages.dev / domains.json → LP
  let active302 = null;
  let pagesCnameTarget = null;
  if (cfInfo.zone) {
    try { active302 = await findActiveForwardingRule(cfInfo.zone.id); } catch {}
    try {
      const records = await cfRequest("/zones/" + cfInfo.zone.id + "/dns_records", {
        headers: cfInfo.token ? { Authorization: "Bearer " + cfInfo.token } : undefined,
      });
      const cnameRec = records?.find(
        (r) => (r.name === domain || r.name === ("www." + domain)) && r.type === "CNAME"
      );
      if (cnameRec?.content?.includes(".pages.dev")) {
        pagesCnameTarget = cnameRec.content.trim().toLowerCase();
      }
    } catch {}
  }

  const repoMatches = findDomainInRepos(domain);
  let matchingTemplate = null;

  if (pagesCnameTarget) {
    const target = pagesCnameTarget;
    const rootBase = target.replace(/\.pages\.dev$/, "").replace(/-\d+$/, "");
    matchingTemplate = ACTIVE_TEMPLATES.find(
      (t) =>
        t.cnameTarget?.toLowerCase() === target ||
        ((t.pagesProject || "") + ".pages.dev").toLowerCase() === target ||
        target.startsWith((t.pagesProject || "").toLowerCase()) ||
        (t.pagesProject && t.pagesProject.replace(/-\d+$/, "").toLowerCase() === rootBase)
    );
  }

  if (!matchingTemplate && repoMatches.length > 0) {
    matchingTemplate =
      ACTIVE_TEMPLATES.find(
        (t) =>
          t.path &&
          repoMatches.some(
            (m) =>
              (m.folderPath || "").toLowerCase().includes(path.basename(t.path).toLowerCase()) ||
              (m.filePath || "").toLowerCase().includes(path.basename(t.path).toLowerCase())
          )
      ) || null;
  }

  if (!matchingTemplate) {
    try {
      const histItems = getHistory() || [];
      const lastLp = histItems.find(
        (h) =>
          h.domain &&
          h.domain.toLowerCase() === domain &&
          (h.templateId || h.actionType?.includes("LP") || h.actionType === "SWITCH_TPL") &&
          h.status !== "failed"
      );
      if (lastLp?.templateId) {
        const tpl = getTemplate(lastLp.templateId);
        if (tpl?.path && fs.existsSync(tpl.path)) matchingTemplate = tpl;
      }
    } catch {}
  }

  const isLandingPage = !active302 && (!!pagesCnameTarget || repoMatches.length > 0 || !!matchingTemplate);
  const validRepoMatches = repoMatches.filter((m) => m && m.folderPath && fs.existsSync(m.folderPath));
  const hasLocalTemplate = matchingTemplate && matchingTemplate.path && fs.existsSync(matchingTemplate.path);

  if (isLandingPage) {
    let updatedRepos = [];
    if (validRepoMatches.length > 0) {
      const res = await updateDomainInExactRepos(domain, link, tele);
      if (res.success) updatedRepos = res.updatedRepos;
    } else if (hasLocalTemplate) {
      const res = await updateTemplateDomainsJson(matchingTemplate, domain, link, tele).catch(() => ({}));
      updatedRepos = [{
        folderPath: matchingTemplate.path,
        filePath: path.join(matchingTemplate.path, "domains.json"),
        projectName: matchingTemplate.pagesProject,
        gitPushed: true,
        jsConfigUpdated: res.jsConfigUpdated,
      }];
    }

    if (cfInfo.zone) {
      await deleteForwardingPageRules(cfInfo.zone.id).catch(() => {});
      await cfRequest("/zones/" + cfInfo.zone.id + "/purge_cache", {
        method: "POST",
        body: { purge_everything: true },
        headers: cfInfo.token ? { Authorization: "Bearer " + cfInfo.token } : undefined,
      }).catch(() => {});
    }

    const histItem = addHistoryItem({
      domain,
      actionType: "SET_LINK",
      actionLabel: "Cập Nhật Link Đích (Landing Page)",
      link,
      tele,
      templateId: matchingTemplate?.id || prev?.templateId || null,
      templateName: matchingTemplate?.name || prev?.templateName || "Landing Page",
      cnameTarget: pagesCnameTarget || matchingTemplate?.cnameTarget || null,
      status: "success",
      cfAccount: cfInfo.accountName,
      ...actorFields,
      details: { mode: "landing_page", updatedRepos: updatedRepos?.map?.((r) => r.filePath || r) || updatedRepos },
    });
    verifyHistoryItem(histItem.id).catch(() => {});
    return {
      success: true,
      type: "landing_page",
      actionLabel: "Cập Nhật Link Đích (Landing Page)",
      domain, link, tele,
      cfAccount: cfInfo.accountName,
      updatedRepos,
      message: "Đã đổi link đích cho Landing Page [" + domain + "] thành công!",
    };
  }

  // 302 path — nếu còn sót trong domains.json LP thì gỡ trước
  if (repoMatches.length > 0 && active302) {
    for (const m of repoMatches) {
      await removeDomainFromRepo(domain, m.filePath || m.folderPath).catch(() => {});
    }
  }

  try {
    const prResult = await updateOrCreatePageRule(domain, link);
    if (cfInfo.zone) {
      await cfRequest("/zones/" + cfInfo.zone.id + "/purge_cache", {
        method: "POST",
        body: { purge_everything: true },
      }).catch(() => {});
    }
    const actionText = prResult.action === "updated" ? "Cập Nhật Link 302 (Page Rule)" : "Tạo Mới Link 302 (Page Rule)";
    const histItem = addHistoryItem({
      domain,
      actionType: "SET_LINK",
      actionLabel: actionText,
      link, tele,
      templateName: "Direct 302 Redirect",
      status: "success",
      cfAccount: cfInfo.accountName,
      ...actorFields,
      details: { mode: "redirect_302", pageRuleAction: prResult.action },
    });
    verifyHistoryItem(histItem.id).catch(() => {});
    return {
      success: true,
      type: "redirect_302",
      actionLabel: actionText,
      domain, link, tele,
      cfAccount: cfInfo.accountName,
      action: prResult.action,
      message: "Đã đổi link 302 chuyển hướng cho [" + domain + "] thành công!",
    };
  } catch (prErr) {
    try {
      await getOrCreateZone(domain);
      const prResult = await updateOrCreatePageRule(domain, link);
      const histItem = addHistoryItem({
        domain,
        actionType: "SET_LINK",
        actionLabel: "Tạo Mới Link 302 (Page Rule)",
        link, tele,
        templateName: "Direct 302 Redirect",
        status: "success",
        cfAccount: cfInfo.accountName,
        ...actorFields,
        details: { mode: "redirect_302", pageRuleAction: prResult.action, createdZone: true },
      });
      verifyHistoryItem(histItem.id).catch(() => {});
      return {
        success: true,
        type: "redirect_302",
        actionLabel: "Tạo Mới Link 302 (Page Rule)",
        domain, link, tele,
        cfAccount: cfInfo.accountName,
        action: prResult.action,
        message: "Đã tạo mới cấu hình 302 Page Rule cho [" + domain + "] thành công!",
      };
    } catch (createErr) {
      return {
        success: false,
        error: "Không thể cập nhật link cho [" + domain + "]: " + createErr.message,
        cfAccount: cfInfo.accountName,
      };
    }
  }
}
