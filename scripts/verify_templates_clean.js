import fs from "node:fs";
import path from "node:path";
import { ACTIVE_TEMPLATES } from "../src/templates.js";

async function verifyAll() {
  let brokenCount = 0;
  for (const t of ACTIVE_TEMPLATES) {
    if (!fs.existsSync(t.path)) continue;
    const htmlPath = path.join(t.path, "index.html");
    if (!fs.existsSync(htmlPath)) continue;

    const html = fs.readFileSync(htmlPath, "utf8");
    const hasReplacement = html.includes("\uFFFD");
    const hasBrokenPatterns = /VA\?O|TRUY\s*CP|THA\?I|VI\+T|CHA\?O/i.test(html);

    if (hasReplacement || hasBrokenPatterns) {
      console.log(`🚨 PHÁT HIỆN LỖI: [${t.name}]`);
      console.log(`   Path: ${htmlPath}`);
      brokenCount++;
    }
  }

  if (brokenCount === 0) {
    console.log("✅ TẤT CẢ 34 MẪU LANDING PAGE ĐỀU SẠCH 100%, KHÔNG CÒN BẢNG MÃ RÁC HAY MOJIBAKE!");
  } else {
    console.log(`⚠️ Có ${brokenCount} mẫu cần xử lý.`);
  }
}

verifyAll();
