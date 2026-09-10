import fs from "node:fs";
import path from "node:path";
import { ACTIVE_TEMPLATES } from "../src/templates.js";

const SCREENSHOTS_DIR = "C:\\FREZE-PRJ\\web-tên-miền\\screenshots";

// 1. Danh sách các ID cần bỏ theo yêu cầu người dùng
const removeIds = [
  "lp_congthuc_hesophu_6b_g88",
  "lp-congthuc-hesophu-6b-g88",
  "lp_xoamaan_3h_gg88",
  "lp-xoamaan-3h-gg88",
  "lp_c168",
  "lp-c168",
  "check_otp_7b_mm_fe",
  "check-otp-7b-mm-fe",
  "07124351",
];

let updatedTemplates = ACTIVE_TEMPLATES.filter((t) => {
  if (removeIds.includes(t.id) || removeIds.includes(t.pagesProject)) {
    console.log(`🗑️ Đã xoá theo yêu cầu: ${t.name} (${t.pagesProject})`);
    const sc = path.join(SCREENSHOTS_DIR, `${t.id}.png`);
    if (fs.existsSync(sc)) {
      try {
        fs.unlinkSync(sc);
      } catch {}
    }
    return false;
  }
  return true;
});

// 2. Cập nhật chi tiết từng item theo yêu cầu
for (const t of updatedTemplates) {
  // lp-gg88-xoamaan -> Chuyển qua GG88
  if (t.pagesProject === "lp-gg88-xoamaan" || t.id === "lp_gg88_xoamaan") {
    t.brand = "GG88";
    t.brandLabel = "GG88";
    console.log("✅ Chuyển sang GG88:", t.name);
  }

  // lp-gg88-c168-qte -> Chuyển qua LLWIN, đổi link sang domain 32llwin.com
  if (t.pagesProject === "lp-gg88-c168-qte" || t.id === "lp_gg88_c168_qte") {
    t.brand = "LLWIN";
    t.brandLabel = "LLWIN";
    t.sampleDomain = "32llwin.com";
    t.sampleUrl = "https://32llwin.com";
    console.log("✅ Chuyển sang LLWIN & đổi domain 32llwin.com:", t.name);
  }

  // lp-game-vip -> Chuyển qua GG88, dùng domain dt8386.cc
  if (t.pagesProject === "lp-game-vip" || t.id === "lp_game_vip") {
    t.brand = "GG88";
    t.brandLabel = "GG88";
    t.sampleDomain = "dt8386.cc";
    t.sampleUrl = "https://dt8386.cc";
    console.log("✅ Chuyển sang GG88 & dùng domain dt8386.cc:", t.name);
  }

  // lp-gg88-fly88 -> Chuyển qua GG88, dùng domain gg88en.com
  if (t.pagesProject === "lp-gg88-fly88" || t.id === "lp_gg88_fly88") {
    t.brand = "GG88";
    t.brandLabel = "GG88";
    t.sampleDomain = "gg88en.com";
    t.sampleUrl = "https://gg88en.com";
    console.log("✅ Chuyển sang GG88 & dùng domain gg88en.com:", t.name);
  }

  // lp-gg882pro -> Cấu hình domain gg8858.com
  if (t.pagesProject === "lp-gg882pro" || t.id === "lp_gg882pro") {
    t.brand = "GG88";
    t.brandLabel = "GG88";
    t.sampleDomain = "gg8858.com";
    t.sampleUrl = "https://www.gg8858.com";
    console.log("✅ Cập nhật domain cho lp-gg882pro:", t.sampleUrl);
  }
}

// 3. Đưa lp-gg88-vip-2 lên ĐẦU MENU GG88 & ĐẦU DANH SÁCH
const vip2Index = updatedTemplates.findIndex(
  (t) => t.pagesProject === "lp-gg88-vip-2" || t.id === "lp_gg88_vip_2"
);
if (vip2Index > -1) {
  const [vip2] = updatedTemplates.splice(vip2Index, 1);
  vip2.brand = "GG88";
  vip2.brandLabel = "GG88";
  vip2.sampleDomain = "gg88us.live";
  vip2.sampleUrl = "https://gg88us.live";
  updatedTemplates.unshift(vip2);
  console.log("⭐ ĐÃ ĐƯA [lp-gg88-vip-2] LÊN ĐẦU DANH SÁCH & ĐẦU MENU GG88!");
}

console.log("\n============================================================");
console.log(`🎉 Tổng số mẫu sau khi cập nhật: ${updatedTemplates.length}`);
console.log("============================================================\n");

const counts = {};
updatedTemplates.forEach((t) => (counts[t.brand] = (counts[t.brand] || 0) + 1));
console.log("Phân bố thương hiệu mới:", counts);

const fileContent = `import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

// Danh sách các mẫu Landing Page HOẠT ĐỘNG TỐT 100% (Đã kiểm tra HTTP 200 OK & Live Demo)
export const ACTIVE_TEMPLATES = ${JSON.stringify(updatedTemplates, null, 2)};

export function listTemplates() {
  return ACTIVE_TEMPLATES;
}

export function getTemplate(idOrFolder) {
  if (!idOrFolder) return ACTIVE_TEMPLATES[0];
  return (
    ACTIVE_TEMPLATES.find(
      (t) =>
        t.id.toLowerCase() === idOrFolder.toLowerCase() ||
        t.folder.toLowerCase() === idOrFolder.toLowerCase() ||
        t.pagesProject.toLowerCase() === idOrFolder.toLowerCase()
    ) || ACTIVE_TEMPLATES[0]
  );
}

export function findTemplateByDomain(domain) {
  const norm = domain.trim().toLowerCase();
  for (const t of ACTIVE_TEMPLATES) {
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

export async function updateTemplateDomainsJson(template, domain, mainUrl, messengerUrl) {
  if (!template.path) throw new Error("Template không có đường dẫn thư mục nguồn");
  const djPath = path.join(template.path, "domains.json");
  let dj = {};
  let isExisting = false;
  if (fs.existsSync(djPath)) {
    try {
      dj = JSON.parse(fs.readFileSync(djPath, "utf8"));
      if (domain in dj) isExisting = true;
    } catch {}
  }
  dj[domain] = {
    main_url: mainUrl,
    messenger_url: messengerUrl || mainUrl,
  };
  fs.writeFileSync(djPath, JSON.stringify(dj, null, 2), "utf8");

  const gitDir = path.join(template.path, ".git");
  if (fs.existsSync(gitDir)) {
    try {
      const commitMsg = isExisting ? \`Update link for domain \${domain}\` : \`Auto add domain \${domain}\`;
      await execAsync(\`git add domains.json && git commit -m "\${commitMsg}" && git push origin main\`, {
        cwd: template.path,
      });
    } catch {}
  }
  return { updated: true, path: djPath, isExisting };
}
`;

fs.writeFileSync("C:\\FREZE-PRJ\\web-tên-miền\\src\\templates.js", fileContent, "utf8");
console.log("💾 Đã lưu cấu hình mới vào src/templates.js thành công!");
