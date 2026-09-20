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
  getAllPagesProjectsForAccount,
} from "./cloudflare.js";
import { ACTIVE_TEMPLATES, updateTemplateDomainsJson, getTemplate, listTemplates, resolveTemplatePath } from "./templates.js";
import { getHistory, addHistoryItem, updateHistoryItem, getLastDomainHistoryMeta, setHistoryProgress } from "./history.js";
import { verifyHistoryItem, waitForLiveLinkMatch, waitFor302RedirectMatch } from "./verifier.js";
import { normalizeDomain, normalizeUrl } from "./utils.js";
import { listHubZonesFromCache, isAdminCfZone, adminSkipPayload, isFrezeHubDomain } from "./cf-account-guard.js";
import { patchIndexHtmlLinks } from "./lp-link-patch.js";

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
    "lp-gg88-gt9-sk": "lp-gg88-gt9-sk",
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

/** Bỏ folder backup / rác — không được coi là source LP để sửa link */
export function isJunkLandingPath(p) {
  const parts = String(p || "").split(/[/\\]/);
  return parts.some((seg) => {
    if (!seg) return false;
    const lower = seg.toLowerCase();
    if (["node_modules", ".git", "dist", "build", "screenshots", "backups"].includes(lower)) return true;
    if (/\.bak($|-)/i.test(seg)) return true;
    if (/\.old($|-)/i.test(seg)) return true;
    if (/\.wrong-/i.test(seg)) return true;
    if (/^backup/i.test(seg)) return true;
    return false;
  });
}

function skipScanDirName(name) {
  const lower = String(name || "").toLowerCase();
  if (["node_modules", ".git", "dist", "build", "screenshots", "backups"].includes(lower)) return true;
  if (/\.bak($|-)/i.test(name)) return true;
  if (/\.old($|-)/i.test(name)) return true;
  if (/\.wrong-/i.test(name)) return true;
  if (/^backup/i.test(name)) return true;
  return false;
}

let listAllDomainsCache = { at: 0, data: null };
const LIST_DOMAINS_TTL_MS = 5 * 60_000;

export function invalidateDomainListCache() {
  listAllDomainsCache = { at: 0, data: null };
}

// 1. Quét tìm toàn bộ các file domains.json trên máy
export function getAllDomainsJsonFiles() {
  const files = [];
  function scan(dir, depth = 0) {
    if (depth > 5) return;
    if (isJunkLandingPath(dir)) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const ent of entries) {
        if (ent.isDirectory()) {
          if (skipScanDirName(ent.name)) continue;
          scan(path.join(dir, ent.name), depth + 1);
        } else if (ent.name === "domains.json") {
          const full = path.join(dir, ent.name);
          if (!isJunkLandingPath(full)) files.push(full);
        }
      }
    } catch {}
  }
  SEARCH_ROOTS.forEach((r) => {
    if (fs.existsSync(r)) scan(r);
  });
  return files;
}

// 2. Tìm chính xác domain nằm ở folder gốc / repo nào (không gồm .bak / backup)
export function findDomainInRepos(domain) {
  const norm = domain.trim().toLowerCase().replace(/^www\./, "");
  const allFiles = getAllDomainsJsonFiles();
  const matches = [];

  for (const f of allFiles) {
    if (isJunkLandingPath(f)) continue;
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

/** Map CNAME pages.dev → template ACTIVE (ưu tiên khớp project / sibling -N) */
export function findTemplateByPagesCname(cnameTarget) {
  if (!cnameTarget) return null;
  const target = String(cnameTarget).trim().toLowerCase().replace(/\.$/, "");
  const host = target.endsWith(".pages.dev") ? target : `${target}.pages.dev`;
  const project = host.replace(/\.pages\.dev$/, "");
  // landing-page-uae-98 → landing-page-uae ; lp-gg88-vip-7 → lp-gg88-vip
  const rootBase = project.replace(/-\d+$/, "");

  const hit =
    ACTIVE_TEMPLATES.find((t) => (t.cnameTarget || "").toLowerCase() === host) ||
    ACTIVE_TEMPLATES.find((t) => `${(t.pagesProject || "").toLowerCase()}.pages.dev` === host) ||
    ACTIVE_TEMPLATES.find((t) => (t.pagesProject || "").toLowerCase() === project) ||
    ACTIVE_TEMPLATES.find((t) => {
      const base = (t.pagesProject || "").replace(/-\d+$/, "").toLowerCase();
      return base && base === rootBase;
    }) ||
    // Họ UAE Admin: CNAME landing-page-uae / -1 / -2 / -98
    (/^landing-page-uae(-\d+)?$/.test(project)
      ? ACTIVE_TEMPLATES.find((t) => t.id === "landing_page_uae")
      : null);

  if (hit?.id) {
    const resolved = getTemplate(hit.id);
    if (resolved) return resolved;
  }
  return hit ? getTemplate(hit.id) || hit : null;
}

function normalizePagesCnameHost(cnameTarget) {
  const target = String(cnameTarget || "").trim().toLowerCase().replace(/\.$/, "");
  return target.endsWith(".pages.dev") ? target : `${target}.pages.dev`;
}

function templateMatchesPagesCname(tpl, cnameTarget) {
  if (!tpl || !cnameTarget) return !cnameTarget;
  const host = normalizePagesCnameHost(cnameTarget);
  const candidates = new Set(
    [
      tpl.cnameTarget,
      tpl.pagesProject ? `${tpl.pagesProject}.pages.dev` : "",
      tpl.pagesProject,
    ]
      .filter(Boolean)
      .map((s) => String(s).trim().toLowerCase().replace(/\.$/, ""))
  );
  const project = host.replace(/\.pages\.dev$/, "");
  candidates.add(host);
  candidates.add(project);
  return candidates.has(host) || candidates.has(project);
}

/** Khi CNAME đã biết nhưng chưa có trong templates — lấy Git repo từ Pages API */
async function resolveTemplateFromPagesCname(cnameTarget, cfInfo) {
  const host = normalizePagesCnameHost(cnameTarget);
  const project = host.replace(/\.pages\.dev$/, "");
  const accId = cfInfo?.accountId || config.cloudflare.accountId();
  const tok = cfInfo?.token || config.cloudflare.token();

  let proj = null;
  try {
    proj = await cfRequest(`/accounts/${accId}/pages/projects/${encodeURIComponent(project)}`, {
      token: tok || undefined,
    });
  } catch {}

  const gitOwner = proj?.source?.config?.owner || "";
  const gitRepoName = proj?.source?.config?.repo_name || "";
  const gitRepo = gitOwner && gitRepoName ? `${gitOwner}/${gitRepoName}` : "";

  if (gitRepo) {
    const byRepo = listTemplates().find(
      (t) => String(t.gitRepo || "").toLowerCase() === gitRepo.toLowerCase()
    );
    if (byRepo && templateMatchesPagesCname(byRepo, host)) {
      return getTemplate(byRepo.id) || byRepo;
    }
  }

  const byProject = getTemplate(project);
  if (byProject?.pagesProject && templateMatchesPagesCname(byProject, host)) {
    return byProject;
  }

  if (gitRepo && gitRepoName) {
    const brand = "GG88";
    const folder = gitRepoName;
    const resolvedPath = resolveTemplatePath(
      path.join("/var/www/Landingpages", brand, folder),
      brand,
      folder
    );
    return {
      id: `pages_${project}`,
      name: project,
      folder,
      path: resolvedPath,
      gitRepo,
      pagesProject: project,
      cnameTarget: host,
      brand,
      brandLabel: brand,
    };
  }

  return null;
}

async function resolveTemplateForDomain(domain, pagesCnameTarget, cfInfo) {
  if (pagesCnameTarget) {
    let tpl = findTemplateByPagesCname(pagesCnameTarget);
    if (!tpl) tpl = await resolveTemplateFromPagesCname(pagesCnameTarget, cfInfo);
    if (tpl && !templateMatchesPagesCname(tpl, pagesCnameTarget)) {
      return {
        template: null,
        error: `Template [${tpl.name || tpl.id}] không khớp CNAME live ${pagesCnameTarget}`,
      };
    }
    if (tpl) return { template: tpl, error: null };
    return {
      template: null,
      error: `CNAME live ${pagesCnameTarget} — chưa map được template/Pages Git cho [${domain}]`,
    };
  }
  return { template: null, error: null };
}

async function resolveServingPagesCname(domain, cfInfo) {
  // 1) DNS CNAME trong zone
  if (cfInfo?.zone) {
    try {
      const records = await cfRequest("/zones/" + cfInfo.zone.id + "/dns_records?per_page=100", {
        headers: cfInfo.token ? { Authorization: "Bearer " + cfInfo.token } : undefined,
      });
      const cnameRec = (records || []).find(
        (r) =>
          (r.name === domain || r.name === "www." + domain) &&
          r.type === "CNAME" &&
          String(r.content || "").includes(".pages.dev")
      );
      if (cnameRec?.content) return cnameRec.content.trim().toLowerCase();
    } catch {}
  }

  // 2) Custom domain đang gắn trên Pages project nào
  try {
    const list = (await getAllPagesProjectsForAccount(cfInfo?.accountId || config.cloudflare.accountId())) || [];
    const norm = domain.toLowerCase();
    for (const p of list) {
      const domains = Array.isArray(p.domains) ? p.domains : [];
      const hit = domains.some((d) => {
        const name = String(typeof d === "string" ? d : d?.name || "").toLowerCase();
        return name === norm || name === `www.${norm}`;
      });
      if (hit) {
        const sub = (p.subdomain || p.name || "").toLowerCase();
        return sub.endsWith(".pages.dev") ? sub : `${sub}.pages.dev`;
      }
    }
  } catch {}

  // 3) Ownership / history
  try {
    const prev = getLastDomainHistoryMeta(domain);
    if (prev?.cnameTarget && String(prev.cnameTarget).includes(".pages.dev")) {
      return String(prev.cnameTarget).trim().toLowerCase();
    }
  } catch {}

  return null;
}

// 3. Kiểm tra domain thuộc tài khoản Cloudflare nào (Freze hoặc Admin)
export async function checkDomainCfAccount(domain) {
  const norm = domain.trim().toLowerCase();
  try {
    const { findZoneByName, tokenForZone, isAdminAccountZone } = await import("./cloudflare.js");
    const zone = await findZoneByName(norm);
    if (zone) {
      const admin = isAdminAccountZone(zone);
      return {
        accountName: zone.account?.name || (admin ? "Admin" : "Freze"),
        accountId: zone.account?.id || zone.accountId || null,
        zone,
        token: tokenForZone(zone),
        cfAccountType: admin ? "admin" : "freze",
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

  // Cập nhật index.html gốc nếu có (nhiều LP hardcode REDIRECT_URL / href)
  const rootHtml = path.join(folderPath, "index.html");
  if (fs.existsSync(rootHtml) && newLink) {
    try {
      let h = fs.readFileSync(rootHtml, "utf8");
      h = patchIndexHtmlLinks(h, norm, newLink);
      fs.writeFileSync(rootHtml, h, "utf8");
      if (!updatedRelPath) updatedRelPath = "index.html";
    } catch (err) {
      console.error(`Lỗi cập nhật ${rootHtml}:`, err.message);
    }
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

// 4. DEPRECATED path — không còn dùng để set-link LP (dễ ghi nhiều folder).
// Giữ lại nhưng: bỏ junk, CHỈ cập nhật folder có .git, và success chỉ khi có ít nhất 1 origin push OK.
export async function updateDomainInExactRepos(domain, newLink, newTele = "") {
  const norm = domain.trim().toLowerCase().replace(/^www\./, "");
  const matches = findDomainInRepos(norm).filter(
    (m) => m?.folderPath && fs.existsSync(m.folderPath) && !isJunkLandingPath(m.folderPath)
  );

  if (matches.length === 0) {
    return {
      success: false,
      error: `Tên miền [${domain}] KHÔNG tồn tại trong folder Git Landing Page hợp lệ!`,
      updatedRepos: [],
    };
  }

  const updatedRepos = [];
  for (const m of matches) {
    const gitDir = path.join(m.folderPath, ".git");
    if (!fs.existsSync(gitDir)) {
      console.warn(`[SetLink] Bỏ qua folder không có .git: ${m.folderPath}`);
      continue;
    }
    try {
      const dj = JSON.parse(fs.readFileSync(m.filePath, "utf8"));
      const existing = typeof dj[norm] === "object" ? dj[norm] : {};

      const mainUrl = newLink || existing.main_url || existing.url || "";
      const teleUrl =
        newTele ||
        existing.telegram_url ||
        existing.tele ||
        (existing.messenger_url && existing.messenger_url !== mainUrl ? existing.messenger_url : "") ||
        "";

      const entry = {
        main_url: mainUrl,
        messenger_url: teleUrl || mainUrl,
        telegram_url: teleUrl || undefined,
      };
      dj[norm] = entry;
      dj[`www.${norm}`] = entry;
      fs.writeFileSync(m.filePath, JSON.stringify(dj, null, 2), "utf8");

      const jsConfigRel = updateJsConfigFile(m.folderPath, norm, mainUrl, teleUrl);
      updateJsConfigFile(m.folderPath, `www.${norm}`, mainUrl, teleUrl);

      let gitPushed = false;
      let gitError = null;
      try {
        let currentBranch = "main";
        try {
          const bRes = await execAsync("git branch --show-current", { cwd: m.folderPath });
          if (bRes.stdout.trim()) currentBranch = bRes.stdout.trim();
        } catch {}
        const filesToAdd = jsConfigRel ? `domains.json ${jsConfigRel}` : "domains.json";
        await execAsync(`git add ${filesToAdd}`, { cwd: m.folderPath });
        await execAsync(`git commit -m "Update link & telegram for ${norm}"`, { cwd: m.folderPath }).catch(() => {});
        await execAsync(`git push origin ${currentBranch}`, { cwd: m.folderPath });
        gitPushed = true;
      } catch (gitErr) {
        gitError = gitErr.message;
        console.warn(`[Git] Lỗi push tại ${m.folderPath}:`, gitErr.message);
      }

      const projectName = getPagesProjectForFolder(m.folderPath);
      if (gitPushed) {
        await deployToAllPagesInstances(projectName, m.folderPath).catch((err) => {
          console.warn(`[Deploy] Deploy warning for ${projectName}:`, err.message);
        });
      }

      updatedRepos.push({
        folderPath: m.folderPath,
        filePath: m.filePath,
        projectName,
        gitPushed,
        gitError,
        jsConfigUpdated: !!jsConfigRel,
      });
    } catch (err) {
      console.error(`Lỗi cập nhật file ${m.filePath}:`, err.message);
    }
  }

  const anyPush = updatedRepos.some((r) => r.gitPushed);
  return {
    success: anyPush,
    error: anyPush ? null : `git push origin thất bại trên mọi folder khớp [${domain}]`,
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
  const now = Date.now();
  if (listAllDomainsCache.data && now - listAllDomainsCache.at < LIST_DOMAINS_TTL_MS) {
    return listAllDomainsCache.data;
  }

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

  // C. Cloudflare Zones — Freze + Admin (khi có ADMIN token)
  try {
    for (const z of listHubZonesFromCache({ includeAdmin: true })) {
      const norm = (z.name || "").trim().toLowerCase();
      if (!norm) continue;
      const isAdmin = isAdminCfZone(z);

      if (!domainMap.has(norm)) {
        domainMap.set(norm, {
          domain: norm,
          mainUrl: "",
          messengerUrl: "",
          telegramUrl: "",
          repos: [],
          filePaths: [],
          primaryFolder: isAdmin ? "Cloudflare (Admin)" : "Cloudflare (Freze)",
          folderPath: "",
          sourceType: "cloudflare",
          actionType: "CLOUDFLARE",
          cfAccount: z.accountName,
          cfAccountType: isAdmin ? "admin" : "freze",
          status: z.status,
          zoneId: z.id,
        });
      } else {
        const existing = domainMap.get(norm);
        if (!existing.cfAccount && z.accountName) {
          existing.cfAccount = z.accountName;
        }
        if (!existing.cfAccountType) {
          existing.cfAccountType = isAdmin ? "admin" : "freze";
        }
        if (!existing.zoneId && z.id) {
          existing.zoneId = z.id;
        }
        if (isAdmin && existing.primaryFolder === "Cloudflare (Freze)") {
          existing.primaryFolder = "Cloudflare (Admin)";
        }
      }
    }
  } catch (err) {
    console.warn("Lỗi nạp cf_zones_cache.json:", err.message);
  }

  // Chỉ loại miền Admin khi thiếu ADMIN token (blockHubMutation)
  const result = Array.from(domainMap.values())
    .filter((d) => isFrezeHubDomain(d.domain))
    .sort((a, b) => a.domain.localeCompare(b.domain));
  listAllDomainsCache = { at: now, data: result };
  return result;
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

  // Không can thiệp miền zone Cloudflare Admin (active)
  const skip = adminSkipPayload(domain);
  if (skip) {
    return { ...skip, type: "admin_cf_skip", cfAccount: skip.cfAccount || cfInfo.accountName };
  }

  const histId = `hist_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  addHistoryItem({
    id: histId,
    domain,
    actionType: "SET_LINK",
    actionLabel: "Cập Nhật Link Đích",
    link,
    tele,
    status: "in_progress",
    progress: "Đang nhận diện LP / 302...",
    cfAccount: cfInfo.accountName || "Đang xác định...",
    ...actorFields,
    details: { step: "Đang nhận diện LP / 302..." },
  });

  // LIVE TRUTH: Page Rule 302 active → 302; else Pages CNAME / custom domain → LP
  let active302 = null;
  if (cfInfo.zone) {
    try {
      active302 = await findActiveForwardingRule(cfInfo.zone.id, {
        token: cfInfo.token || undefined,
      });
    } catch {}
  }

  const repoMatches = findDomainInRepos(domain);
  let pagesCnameTarget = await resolveServingPagesCname(domain, cfInfo);

  let matchingTemplate = null;
  if (pagesCnameTarget) {
    const resolved = await resolveTemplateForDomain(domain, pagesCnameTarget, cfInfo);
    matchingTemplate = resolved.template;
    if (!matchingTemplate && resolved.error) {
      updateHistoryItem(histId, {
        status: "failed",
        progress: null,
        error: resolved.error,
        cnameTarget: pagesCnameTarget,
      });
      return { success: false, error: resolved.error, histId, cnameTarget: pagesCnameTarget };
    }
  }

  // Chỉ fallback repo/history khi CHƯA biết CNAME Pages (tránh push nhầm repo như gg88pr)
  if (!pagesCnameTarget && !matchingTemplate && repoMatches.length > 0) {
    matchingTemplate =
      ACTIVE_TEMPLATES.find(
        (t) =>
          t.folder &&
          repoMatches.some(
            (m) =>
              path.basename(m.folderPath || "").toLowerCase() === String(t.folder).toLowerCase()
          )
      ) || null;
    if (matchingTemplate?.id) matchingTemplate = getTemplate(matchingTemplate.id) || matchingTemplate;
  }

  if (!pagesCnameTarget && !matchingTemplate) {
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
        if (!pagesCnameTarget && lastLp.cnameTarget) pagesCnameTarget = lastLp.cnameTarget;
      }
    } catch {}
  }

  if (matchingTemplate?.id && !(matchingTemplate.path && fs.existsSync(matchingTemplate.path))) {
    matchingTemplate = getTemplate(matchingTemplate.id) || matchingTemplate;
  }

  const isLandingPage = !active302 && (!!pagesCnameTarget || !!matchingTemplate);
  let hasLocalTemplate =
    matchingTemplate &&
    ((matchingTemplate.path && fs.existsSync(matchingTemplate.path)) || !!matchingTemplate.gitRepo);

  if (isLandingPage) {
    if (!hasLocalTemplate) {
      updateHistoryItem(histId, {
        status: "failed",
        progress: null,
        error: "Không tìm thấy folder Git template",
        templateName: matchingTemplate?.name || "N/A",
        cnameTarget: pagesCnameTarget || null,
      });
      return {
        success: false,
        error:
          `Không tìm thấy folder Git template cho [${domain}]` +
          (pagesCnameTarget ? ` (CNAME ${pagesCnameTarget})` : "") +
          `. Không ghi folder lệch / .bak.`,
        histId,
      };
    }

    const gitDir = path.join(matchingTemplate.path, ".git");
    const hasLocalGit = fs.existsSync(gitDir);

    setHistoryProgress(histId, `Đang push Git mẫu [${matchingTemplate.name}]...`, {
      templateId: matchingTemplate.id,
      templateName: matchingTemplate.name,
      cnameTarget: pagesCnameTarget || matchingTemplate.cnameTarget || null,
    });

    let pushRes;
    try {
      if (hasLocalGit) {
        pushRes = await updateTemplateDomainsJson(matchingTemplate, domain, link, tele);
      } else if (matchingTemplate.gitRepo) {
        const { upsertDomainEntryInRepo } = await import("./github.js");
        setHistoryProgress(histId, `Push GitHub API → ${matchingTemplate.gitRepo}...`, {
          templateId: matchingTemplate.id,
          templateName: matchingTemplate.name,
        });
        await upsertDomainEntryInRepo(
          matchingTemplate.gitRepo,
          domain,
          {
            main_url: link,
            messenger_url: tele || link,
            telegram_url: tele || undefined,
          },
          { message: `Update link & telegram for ${domain}` }
        );
        pushRes = { gitPush: { originOk: true, via: "github_api" }, jsConfigUpdated: false };
      } else {
        throw new Error(
          `Template [${matchingTemplate.id}] thiếu .git tại ${matchingTemplate.path} và không có gitRepo`
        );
      }
    } catch (err) {
      updateHistoryItem(histId, {
        actionLabel: "Cập Nhật Link Đích (Landing Page)",
        templateId: matchingTemplate.id || null,
        templateName: matchingTemplate.name || "Landing Page",
        cnameTarget: pagesCnameTarget || matchingTemplate.cnameTarget || null,
        status: "failed",
        progress: null,
        liveStatus: "LINK_PUSH_FAILED",
        cfAccount: cfInfo.accountName,
        error: err.message,
        details: { mode: "landing_page", error: err.message, path: matchingTemplate.path },
      });
      return {
        success: false,
        error: err.message,
        histId,
        type: "landing_page",
      };
    }

    setHistoryProgress(histId, "Đang purge cache Cloudflare...");
    if (cfInfo.zone) {
      await deleteForwardingPageRules(cfInfo.zone.id).catch(() => {});
      await cfRequest("/zones/" + cfInfo.zone.id + "/purge_cache", {
        method: "POST",
        body: { purge_everything: true },
        headers: cfInfo.token ? { Authorization: "Bearer " + cfInfo.token } : undefined,
      }).catch(() => {});
    }

    setHistoryProgress(histId, "Đang chờ live link khớp (domains.json)...", {
      templateId: matchingTemplate.id,
      templateName: matchingTemplate.name,
    });
    const liveCheck = await waitForLiveLinkMatch(domain, link, { maxAttempts: 15, delayMs: 8000 });
    if (!liveCheck.ok) {
      updateHistoryItem(histId, {
        actionLabel: "Cập Nhật Link Đích (Landing Page)",
        templateId: matchingTemplate.id || null,
        templateName: matchingTemplate.name || "Landing Page",
        cnameTarget: pagesCnameTarget || matchingTemplate.cnameTarget || null,
        status: "failed",
        progress: null,
        liveStatus: "LINK_MISMATCH",
        cfAccount: cfInfo.accountName,
        error: liveCheck.error,
        liveLinkObserved: liveCheck.link,
        details: {
          mode: "landing_page",
          route: "cname_template_git_push",
          gitPush: pushRes?.gitPush || null,
          verifyError: liveCheck.error,
          claimedLink: link,
          liveLink: liveCheck.link,
        },
      });
      return {
        success: false,
        verified: false,
        type: "landing_page",
        domain,
        link,
        tele,
        error: `Đã push Git nhưng live chưa khớp — ${liveCheck.error}`,
        histId,
        liveLink: liveCheck.link,
        claimedLink: link,
      };
    }

    const updatedRepos = [
      {
        folderPath: matchingTemplate.path,
        filePath: path.join(matchingTemplate.path, "domains.json"),
        projectName: matchingTemplate.pagesProject,
        gitPushed: !!(pushRes?.gitPush?.originOk),
        jsConfigUpdated: !!pushRes?.jsConfigUpdated,
      },
    ];

    const histItem = updateHistoryItem(histId, {
      actionLabel: "Cập Nhật Link Đích (Landing Page)",
      templateId: matchingTemplate.id || prev?.templateId || null,
      templateName: matchingTemplate.name || prev?.templateName || "Landing Page",
      cnameTarget: pagesCnameTarget || matchingTemplate.cnameTarget || null,
      status: "success",
      progress: null,
      liveStatus: "200_OK",
      cfAccount: cfInfo.accountName,
      details: {
        mode: "landing_page",
        route: "cname_template_git_push",
        updatedRepos: updatedRepos.map((r) => r.filePath),
        gitPush: pushRes?.gitPush || null,
        liveVerified: true,
        liveLink: liveCheck.link,
        verifyAttempts: liveCheck.attempts,
      },
    });
    verifyHistoryItem(histItem.id, true).catch(() => {});
    return {
      success: true,
      verified: true,
      type: "landing_page",
      actionLabel: "Cập Nhật Link Đích (Landing Page)",
      domain,
      link,
      tele,
      cfAccount: cfInfo.accountName,
      updatedRepos,
      cnameTarget: pagesCnameTarget || matchingTemplate.cnameTarget || null,
      templateId: matchingTemplate.id,
      histId,
      liveLink: liveCheck.link,
      message: `Live đã khớp link [${domain}] → ${liveCheck.link}`,
    };
  }

  // 302 path — nếu còn sót trong domains.json LP thì gỡ trước
  setHistoryProgress(histId, "Đang cập nhật Page Rule 302...");
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
        headers: cfInfo.token ? { Authorization: "Bearer " + cfInfo.token } : undefined,
      }).catch(() => {});
    }
    setHistoryProgress(histId, "Đang chờ 302 redirect khớp link...");
    const r302 = await waitFor302RedirectMatch(domain, link);
    if (!r302.ok) {
      updateHistoryItem(histId, {
        actionLabel: prResult.action === "updated" ? "Cập Nhật Link 302 (Page Rule)" : "Tạo Mới Link 302 (Page Rule)",
        templateName: "Direct 302 Redirect",
        status: "failed",
        progress: null,
        liveStatus: "LINK_MISMATCH",
        cfAccount: cfInfo.accountName,
        error: r302.error,
        liveLinkObserved: r302.link,
        details: { mode: "redirect_302", pageRuleAction: prResult.action, verifyError: r302.error },
      });
      return {
        success: false,
        verified: false,
        type: "redirect_302",
        domain,
        link,
        tele,
        error: `Page Rule đã ghi nhưng live 302 chưa khớp — ${r302.error}`,
        histId,
      };
    }
    const actionText = prResult.action === "updated" ? "Cập Nhật Link 302 (Page Rule)" : "Tạo Mới Link 302 (Page Rule)";
    const histItem = updateHistoryItem(histId, {
      actionLabel: actionText,
      templateName: "Direct 302 Redirect",
      status: "success",
      progress: null,
      liveStatus: "200_OK",
      cfAccount: cfInfo.accountName,
      details: { mode: "redirect_302", pageRuleAction: prResult.action, liveVerified: true, liveLink: r302.link },
    });
    verifyHistoryItem(histItem.id).catch(() => {});
    return {
      success: true,
      verified: true,
      type: "redirect_302",
      actionLabel: actionText,
      domain, link, tele,
      cfAccount: cfInfo.accountName,
      action: prResult.action,
      histId,
      liveLink: r302.link,
      message: `Live 302 đã khớp link [${domain}] → ${r302.link}`,
    };
  } catch (prErr) {
    try {
      setHistoryProgress(histId, "Đang tạo zone / Page Rule 302...");
      await getOrCreateZone(domain);
      const prResult = await updateOrCreatePageRule(domain, link);
      setHistoryProgress(histId, "Đang chờ 302 redirect khớp link...");
      const r302 = await waitFor302RedirectMatch(domain, link);
      if (!r302.ok) {
        updateHistoryItem(histId, {
          actionLabel: "Tạo Mới Link 302 (Page Rule)",
          templateName: "Direct 302 Redirect",
          status: "failed",
          progress: null,
          liveStatus: "LINK_MISMATCH",
          cfAccount: cfInfo.accountName,
          error: r302.error,
          details: { mode: "redirect_302", pageRuleAction: prResult.action, createdZone: true, verifyError: r302.error },
        });
        return {
          success: false,
          verified: false,
          type: "redirect_302",
          domain,
          link,
          tele,
          error: `Page Rule đã ghi nhưng live 302 chưa khớp — ${r302.error}`,
          histId,
        };
      }
      const histItem = updateHistoryItem(histId, {
        actionLabel: "Tạo Mới Link 302 (Page Rule)",
        templateName: "Direct 302 Redirect",
        status: "success",
        progress: null,
        liveStatus: "200_OK",
        cfAccount: cfInfo.accountName,
        details: { mode: "redirect_302", pageRuleAction: prResult.action, createdZone: true, liveVerified: true, liveLink: r302.link },
      });
      verifyHistoryItem(histItem.id).catch(() => {});
      return {
        success: true,
        verified: true,
        type: "redirect_302",
        actionLabel: "Tạo Mới Link 302 (Page Rule)",
        domain, link, tele,
        cfAccount: cfInfo.accountName,
        action: prResult.action,
        histId,
        liveLink: r302.link,
        message: `Live 302 đã khớp link [${domain}] → ${r302.link}`,
      };
    } catch (createErr) {
      updateHistoryItem(histId, {
        status: "failed",
        progress: null,
        error: createErr.message || prErr.message,
        templateName: "Direct 302 Redirect",
      });
      return {
        success: false,
        error: "Không thể cập nhật link cho [" + domain + "]: " + createErr.message,
        cfAccount: cfInfo.accountName,
        histId,
      };
    }
  }
}
