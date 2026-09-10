import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { ACTIVE_TEMPLATES } from "../src/templates.js";

const execAsync = promisify(exec);
const ROOT_DIR = "C:\\FREZE-PRJ\\web-tên-miền";
const SCREENSHOTS_DIR = path.join(ROOT_DIR, "screenshots");
const TEMPLATES_FILE = path.join(ROOT_DIR, "src", "templates.js");
const CHROME_BIN = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

async function main() {
  console.log("=================================================");
  console.log("🧹 1. LỌC CHỈ GIỮ LẠI GG88, LLWIN VÀ MM88");
  console.log("=================================================\n");

  const keptTemplates = ACTIVE_TEMPLATES.filter((t) =>
    ["GG88", "LLWIN", "MM88"].includes(t.brand?.toUpperCase())
  );

  console.log(`✅ Giữ lại ${keptTemplates.length} mẫu:`);
  const brandStats = {};
  keptTemplates.forEach((t) => {
    brandStats[t.brand] = (brandStats[t.brand] || 0) + 1;
  });
  console.log("   Chi tiết:", brandStats);

  // Cập nhật lại file src/templates.js
  const fileContent = `import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

// Danh sách các mẫu Landing Page CHUẨN HOẠT ĐỘNG (Chỉ giữ GG88, LLWIN, MM88)
export const ACTIVE_TEMPLATES = ${JSON.stringify(keptTemplates, null, 2)};

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

  fs.writeFileSync(TEMPLATES_FILE, fileContent, "utf8");
  console.log("\n💾 Đã cập nhật xong file src/templates.js!");

  // 2. Dọn dẹp các ảnh screenshot của các mẫu đã bị xoá
  console.log("\n=================================================");
  console.log("🧹 2. DỌN DẸP ẢNH CỦA CÁC MẪU BỊ LOẠI BỎ");
  console.log("=================================================\n");

  const keptIds = new Set(keptTemplates.map((t) => t.id));
  const existingFiles = fs.readdirSync(SCREENSHOTS_DIR);
  let deletedCount = 0;

  for (const file of existingFiles) {
    if (file.endsWith(".png")) {
      const id = file.replace(".png", "");
      if (!keptIds.has(id)) {
        try {
          fs.unlinkSync(path.join(SCREENSHOTS_DIR, file));
          console.log(`🗑️ Đã xoá ảnh mẫu không thuộc GG/MM/LLWIN: ${file}`);
          deletedCount++;
        } catch {}
      }
    }
  }
  console.log(`✅ Đã dọn dẹp ${deletedCount} ảnh không cần thiết.`);

  // 3. Chụp lại ảnh toàn bộ 34 mẫu với thời gian chờ 5s
  console.log("\n=================================================");
  console.log("📸 3. CHỤP LẠI TOÀN BỘ ẢNH (CHỜ 5 GIÂY ĐỂ LOAD HẾT HIỆU ỨNG)");
  console.log("=================================================\n");

  for (let i = 0; i < keptTemplates.length; i++) {
    const t = keptTemplates[i];
    const outFile = path.join(SCREENSHOTS_DIR, `${t.id}.png`);
    const targetUrl = t.sampleUrl || `https://${t.cnameTarget}`;

    console.log(`[${i + 1}/${keptTemplates.length}] ⏳ Đang chụp: [${t.brand}] ${t.name}`);
    console.log(`    🔗 URL: ${targetUrl}`);

    try {
      // --virtual-time-budget=5500 cho phép chrome chạy script & animation đúng 5.5 giây trước khi chụp
      const cmd = `"${CHROME_BIN}" --headless=new --disable-gpu --hide-scrollbars --window-size=1280,800 --virtual-time-budget=5500 --screenshot="${outFile}" "${targetUrl}"`;
      await execAsync(cmd, { timeout: 12000 });

      if (fs.existsSync(outFile) && fs.statSync(outFile).size > 1000) {
        console.log(`    ✅ Đã chụp thành công (${fs.statSync(outFile).size} bytes)`);
      } else {
        console.log(`    ⚠️ Kích thước file nhỏ hoặc chưa chụp được`);
      }
    } catch (err) {
      console.log(`    ⚠️ Lỗi khi chụp ${t.name}: ${err.message}`);
    }
  }

  console.log("\n🎉 HOÀN TẤT TẤT CẢ QUY TRÌNH CHỤP ẢNH & LỌC MẪU!");
}

main();
