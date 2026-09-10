import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { ACTIVE_TEMPLATES } from "../src/templates.js";

const execAsync = promisify(exec);

// Regex tìm lỗi ký tự mojibake tiếng Việt phổ biến
const BROKEN_PATTERNS = [
  /\uFFFD/,
  /VA\?O/i,
  /TRUY\s*CP/i,
  /C"NG/i,
  /QU\?C\s*T_/i,
  /THA\?I/i,
  /VI\+T/i,
  /CHA\?O/i,
  /s-a/i,
  /ThAm/i,
  /khA'ng/i,
  /`Tng/i,
  /Cu\s*hAnh/i,
];

export async function scanActiveTemplates() {
  console.log("==================================================");
  console.log("🔍 QUÉT MÃ NGUỒN TẤT CẢ CÁC MẪU LANDING PAGE...");
  console.log("==================================================\n");

  const issues = [];

  for (const tpl of ACTIVE_TEMPLATES) {
    if (!fs.existsSync(tpl.path)) {
      continue;
    }

    const filesToCheck = ["index.html", "config.js", "links.js", "protect.js", "styles.css"];
    for (const filename of filesToCheck) {
      const fullPath = path.join(tpl.path, filename);
      if (!fs.existsSync(fullPath)) continue;

      try {
        const content = fs.readFileSync(fullPath, "utf8");
        const matched = [];
        for (const p of BROKEN_PATTERNS) {
          if (p.test(content)) {
            matched.push(p.toString());
          }
        }

        if (matched.length > 0) {
          issues.push({
            templateId: tpl.id,
            templateName: tpl.name,
            folder: tpl.path,
            filename,
            fullPath,
            matched,
          });
        }
      } catch (e) {}
    }
  }

  console.log(`Tìm thấy ${issues.length} file có dấu hiệu lỗi bảng mã:\n`);
  for (const item of issues) {
    console.log(`📌 [${item.templateName}] (${item.templateId})`);
    console.log(`   File: ${item.fullPath}`);
    console.log(`   Lỗi: ${item.matched.join(", ")}\n`);
  }

  return issues;
}

scanActiveTemplates();
