import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { ACTIVE_TEMPLATES } from "../src/templates.js";

const execAsync = promisify(exec);
const SCREENSHOTS_DIR = "C:\\FREZE-PRJ\\web-tên-miền\\screenshots";
if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

const CHROME_BIN = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

export async function generateAllScreenshots() {
  console.log("📸 BẮT ĐẦU CHỤP ẢNH PREVIEW (CÓ TIMEOUT & CACHE)...\n");

  for (const t of ACTIVE_TEMPLATES) {
    const outFile = path.join(SCREENSHOTS_DIR, `${t.id}.png`);
    if (fs.existsSync(outFile) && fs.statSync(outFile).size > 1000) {
      console.log(`⏩ [${t.name}] Đã có ảnh (${fs.statSync(outFile).size} bytes). Bỏ qua.`);
      continue;
    }

    const targetUrl = t.sampleUrl || `https://${t.cnameTarget}`;
    console.log(`🖼️ [${t.name}] Đang chụp từ: ${targetUrl}...`);

    try {
      const cmd = `"${CHROME_BIN}" --headless=new --disable-gpu --hide-scrollbars --window-size=1200,800 --virtual-time-budget=4000 --screenshot="${outFile}" "${targetUrl}"`;
      await execAsync(cmd, { timeout: 8000 });

      if (fs.existsSync(outFile) && fs.statSync(outFile).size > 0) {
        console.log(`  ✅ Đã lưu ảnh: ${outFile} (${fs.statSync(outFile).size} bytes)`);
      } else {
        console.log(`  ⚠️ Không chụp được ${t.name}`);
      }
    } catch (err) {
      console.log(`  ⚠️ Bỏ qua ${t.name}: Timeout / Lỗi`);
    }
  }

  console.log("\n🎉 HOÀN TẤT CHỤP TOÀN BỘ ẢNH PREVIEW!");
}

generateAllScreenshots();
