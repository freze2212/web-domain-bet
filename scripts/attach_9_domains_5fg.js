import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { setupCloudflare, addPagesDomain, ensurePagesCname } from "../src/cloudflare.js";
import { normalizeDomain, normalizeUrl } from "../src/utils.js";

const execAsync = promisify(exec);
const REPO_DIR = "C:\\GG88\\landing-page-5f";
const PAGES_PROJECT = "landingpage-5f-g";
const CNAME_TARGET = "landingpage-5f-g.pages.dev";

const DOMAINS_TO_ATTACH = [
  { domain: "gg88qte.com", link: "https://gg8846.com/?id=566308881" },
  { domain: "gg88sing.co", link: "https://www.gg8814.com/?id=482086186" },
  { domain: "g88sing.com", link: "https://www.gg8838.com/?id=407699684" },
  { domain: "gg88sin.net", link: "https://www.gg8838.com/?id=407699684" },
  { domain: "gg88sgp.com", link: "https://www.gg8826.com/?id=720056733" },
  { domain: "gg88quocte.com", link: "https://www.gg8826.com/?id=720056733" },
  { domain: "gg88sing.org", link: "https://www.gg8826.com/?id=720056733" },
  { domain: "gg8sing.vip", link: "https://www.gg8826.com/?id=720056733" },
  { domain: "gg88am.com", link: "https://www.gg8826.com/?id=720056733" },
];

async function main() {
  console.log("=================================================");
  console.log(`🚀 GẮN 9 DOMAIN VÀO LANDING PAGE: ${PAGES_PROJECT} (${CNAME_TARGET})`);
  console.log("=================================================\n");

  // 1. Cập nhật config.js trong C:\GG88\landing-page-5f
  const configJsPath = path.join(REPO_DIR, "config.js");
  const domainsJsonPath = path.join(REPO_DIR, "domains.json");

  let domainsMap = {};
  if (fs.existsSync(domainsJsonPath)) {
    try {
      domainsMap = JSON.parse(fs.readFileSync(domainsJsonPath, "utf8"));
    } catch {}
  }

  // Đọc config.js hiện tại để giữ lại các domain cũ
  let existingConfigDomains = {};
  if (fs.existsSync(configJsPath)) {
    try {
      const content = fs.readFileSync(configJsPath, "utf8");
      const match = content.match(/domains:\s*\{([^}]+)\}/s);
      if (match) {
        const lines = match[1].split("\n");
        for (const line of lines) {
          const m = line.match(/"([^"]+)":\s*"([^"]+)"/);
          if (m) {
            existingConfigDomains[m[1].toLowerCase()] = m[2].trim();
          }
        }
      }
    } catch {}
  }

  // Thêm 9 domain mới vào mapping
  for (const item of DOMAINS_TO_ATTACH) {
    const dom = normalizeDomain(item.domain);
    const lnk = normalizeUrl(item.link);
    existingConfigDomains[dom] = lnk;
    domainsMap[dom] = {
      main_url: lnk,
      messenger_url: lnk,
    };
  }

  // Ghi lại file domains.json
  fs.writeFileSync(domainsJsonPath, JSON.stringify(domainsMap, null, 2), "utf8");
  console.log(`✅ Đã cập nhật ${domainsJsonPath} (Tổng: ${Object.keys(domainsMap).length} domains)`);

  // Tạo nội dung mới cho config.js
  const configJsLines = [
    `/**`,
    ` * Cấu hình link redirect theo domain (Cloudflare Pages).`,
    ` */`,
    `window.LINK_CONFIG = {`,
    `  default: "https://gg8835.com/?id=153189538",`,
    ``,
    `  domains: {`,
  ];

  for (const [d, l] of Object.entries(existingConfigDomains)) {
    configJsLines.push(`    "${d}": "${l}",`);
  }

  configJsLines.push(`  },`);
  configJsLines.push(`};`);
  configJsLines.push(``);
  configJsLines.push(`(function () {`);
  configJsLines.push(`  "use strict";`);
  configJsLines.push(``);
  configJsLines.push(`  function normalizeHost(host) {`);
  configJsLines.push(`    return (host || "").toLowerCase().replace(/^www\\./, "");`);
  configJsLines.push(`  }`);
  configJsLines.push(``);
  configJsLines.push(`  window.getRedirectUrl = function () {`);
  configJsLines.push(`    var cfg = window.LINK_CONFIG || {};`);
  configJsLines.push(`    var domains = cfg.domains || {};`);
  configJsLines.push(`    var host = normalizeHost(window.location.hostname);`);
  configJsLines.push(``);
  configJsLines.push(`    for (var domain in domains) {`);
  configJsLines.push(`      if (!Object.prototype.hasOwnProperty.call(domains, domain)) continue;`);
  configJsLines.push(`      if (normalizeHost(domain) === host) {`);
  configJsLines.push(`        return domains[domain];`);
  configJsLines.push(`      }`);
  configJsLines.push(`    }`);
  configJsLines.push(``);
  configJsLines.push(`    return cfg.default || "#";`);
  configJsLines.push(`  };`);
  configJsLines.push(``);
  configJsLines.push(`  window.REDIRECT_URL = window.getRedirectUrl();`);
  configJsLines.push(`})();`);

  fs.writeFileSync(configJsPath, configJsLines.join("\n"), "utf8");
  console.log(`✅ Đã cập nhật ${configJsPath}`);

  // 2. Cấu hình Cloudflare DNS CNAME & Custom Domain cho từng domain
  console.log("\n=================================================");
  console.log("🌐 2. CẤU HÌNH CLOUDFLARE DNS & PAGES CUSTOM DOMAIN");
  console.log("=================================================\n");

  for (const item of DOMAINS_TO_ATTACH) {
    const dom = normalizeDomain(item.domain);
    console.log(`\n⏳ Đang xử lý: ${dom} ➔ ${item.link}...`);

    try {
      // 1. Ensure CNAME DNS records on Cloudflare
      await setupCloudflare(dom, CNAME_TARGET);
      console.log(`   ✅ Cấu hình DNS CNAME [${dom} ➔ ${CNAME_TARGET}] thành công`);
    } catch (err) {
      console.log(`   ⚠️ Cảnh báo DNS [${dom}]: ${err.message}`);
    }

    try {
      // 2. Add custom domain to Cloudflare Pages project
      await addPagesDomain(dom, PAGES_PROJECT);
      console.log(`   ✅ Đã gắn Custom Domain [${dom}] vào Pages [${PAGES_PROJECT}]`);
    } catch (err) {
      console.log(`   ⚠️ Cảnh báo Pages Custom Domain [${dom}]: ${err.message}`);
    }
  }

  // 3. Git commit & Push repo C:\GG88\landing-page-5f
  console.log("\n=================================================");
  console.log("📦 3. GIT COMMIT & PUSH MÃ NGUỒN");
  console.log("=================================================\n");

  try {
    const gitStatus = await execAsync("git status --porcelain", { cwd: REPO_DIR });
    if (gitStatus.stdout.trim()) {
      await execAsync("git add config.js domains.json", { cwd: REPO_DIR });
      await execAsync(`git commit -m "Attach 9 domains to landingpage-5f-g"`, { cwd: REPO_DIR });
      const pushRes = await execAsync("git push origin main", { cwd: REPO_DIR });
      console.log(`✅ Đã Git Push lên repo origin/main thành công:\n${pushRes.stdout || pushRes.stderr}`);
    } else {
      console.log("ℹ️ Không có thay đổi git mới.");
    }
  } catch (err) {
    console.log(`⚠️ Git error: ${err.message}`);
  }

  // 4. Wrangler pages deploy
  console.log("\n=================================================");
  console.log("⚡ 4. DEPLOY TRỰC TIẾP LÊN CLOUDFLARE PAGES");
  console.log("=================================================\n");

  try {
    const wranglerRes = await execAsync(`npx -y wrangler pages deploy . --project-name ${PAGES_PROJECT} --commit-dirty=true`, {
      cwd: REPO_DIR,
      timeout: 45000,
    });
    console.log(`✅ Wrangler Deploy hoàn tất:\n${wranglerRes.stdout}`);
  } catch (err) {
    console.log(`⚠️ Wrangler deploy notice: ${err.message}`);
  }

  console.log("\n🎉 HOÀN TẤT GẮN 9 DOMAIN VÀO LANDING PAGE!");
}

main().catch((err) => {
  console.error("FATAL ERROR:", err);
});
