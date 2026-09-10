import fs from "node:fs";
import path from "node:path";
import { ACTIVE_TEMPLATES } from "../src/templates.js";

const SCREENSHOTS_DIR = "C:\\FREZE-PRJ\\web-tên-miền\\screenshots";

async function filterAndClean() {
  console.log("🧹 BẮT ĐẦU LỌC & LOẠI BỎ TẤT CẢ TRANG LỖI...");
  const validTemplates = [];
  const seenCname = new Set();
  const removedTemplates = [];

  for (const t of ACTIVE_TEMPLATES) {
    const targetUrl = "https://" + t.cnameTarget;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(targetUrl, {
        signal: controller.signal,
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
      });
      clearTimeout(timeout);

      const html = await res.text();
      const isCfError =
        html.includes("Error 522") ||
        html.includes("Error 1014") ||
        html.includes("404 Not Found") ||
        html.includes("Cannot GET");
      const isTooShort = html.trim().length < 200;

      // Bỏ qua các tên generic như public, fe, web, reg, original
      const isGeneric = ["public", "fe", "web", "reg", "original"].includes(
        t.pagesProject.toLowerCase()
      );

      if (res.status === 200 && !isCfError && !isTooShort && !isGeneric) {
        if (!seenCname.has(t.cnameTarget.toLowerCase())) {
          seenCname.add(t.cnameTarget.toLowerCase());
          validTemplates.push(t);
          console.log(`✅ GIỮ LẠI: [${t.brand}] ${t.name} -> ${targetUrl}`);
        }
      } else {
        removedTemplates.push(t);
        console.log(`🗑️ LOẠI BỎ: [${t.brand}] ${t.name} -> ${targetUrl} (Status: ${res.status}, Len: ${html.length})`);
        const screenshotFile = path.join(SCREENSHOTS_DIR, `${t.id}.png`);
        if (fs.existsSync(screenshotFile)) {
          try {
            fs.unlinkSync(screenshotFile);
          } catch {}
        }
      }
    } catch (err) {
      removedTemplates.push(t);
      console.log(`🗑️ LOẠI BỎ (Lỗi fetch): [${t.brand}] ${t.name} -> ${targetUrl} (${err.message})`);
      const screenshotFile = path.join(SCREENSHOTS_DIR, `${t.id}.png`);
      if (fs.existsSync(screenshotFile)) {
        try {
          fs.unlinkSync(screenshotFile);
        } catch {}
      }
    }
  }

  console.log("\n============================================================");
  console.log(`🎉 Số lượng Landing Page SẠCH 100% HOẠT ĐỘNG: ${validTemplates.length}`);
  console.log(`🗑️ Đã loại bỏ: ${removedTemplates.length} mẫu lỗi`);
  console.log("============================================================\n");

  const brandSummary = {};
  validTemplates.forEach((t) => (brandSummary[t.brand] = (brandSummary[t.brand] || 0) + 1));
  console.log("Phân bố theo thương hiệu sau khi làm sạch:", brandSummary);

  const fileContent = `import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

// Danh sách các mẫu Landing Page HOẠT ĐỘNG TỐT 100% (Đã kiểm tra HTTP 200 OK & Live Demo)
export const ACTIVE_TEMPLATES = ${JSON.stringify(validTemplates, null, 2)};

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
  if (fs.existsSync(djPath)) {
    try {
      dj = JSON.parse(fs.readFileSync(djPath, "utf8"));
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
      await execAsync(\`git add domains.json && git commit -m "Auto add domain \${domain}" && git push origin main\`, {
        cwd: template.path,
      });
    } catch {}
  }
  return { updated: true, path: djPath };
}
`;

  fs.writeFileSync("C:\\FREZE-PRJ\\web-tên-miền\\src\\templates.js", fileContent, "utf8");
  console.log("💾 Đã lưu danh sách mẫu sạch vào src/templates.js!");
}

filterAndClean();
