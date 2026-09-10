import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

const SEARCH_ROOTS = [
  "C:\\Landingpage",
  "C:\\GG88",
  "C:\\MM88",
  "C:\\LLWIN",
  "C:\\RR88",
  "C:\\ALO8",
  "C:\\FREZE-PRJ",
];

// Common mojibake patterns to detect
const BROKEN_PATTERNS = [
  /\uFFFD/, // Replacement character 
  /c\s*ng/i,
  /chA-nh/i,
  /thcc/i,
  /TRUY\s*CP/i,
  /C"NG/i,
  /QU\?C\s*T_/i,
  /VA\?O/i,
  /THA\?I/i,
  /VI\+T/i,
  /CHA\?O/i,
  /,/i,
  /\?/i,
  /`/i,
  /s-a/i,
  /trc/i,
  /tip/i,
  /ThAm/i,
  /Cu\s*hAnh/i,
  /`Tng/i,
  /khA'ng/i,
  /ti/i,
];

function scanFiles(dir, fileList = []) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      if (
        ent.isDirectory() &&
        !["node_modules", ".git", "dist", "build", "screenshots", "backups", ".gemini"].includes(ent.name)
      ) {
        scanFiles(path.join(dir, ent.name), fileList);
      } else if (ent.isFile() && (ent.name.endsWith(".html") || ent.name.endsWith(".js") || ent.name.endsWith(".json"))) {
        fileList.push(path.join(dir, ent.name));
      }
    }
  } catch (err) {}
  return fileList;
}

export async function scanAndReportUtf8() {
  console.log("==================================================");
  console.log("🔍 ĐANG QUÉT TOÀN BỘ FILE TRONG TẤT CẢ REPO...");
  console.log("==================================================\n");

  const allFiles = [];
  for (const root of SEARCH_ROOTS) {
    if (fs.existsSync(root)) {
      scanFiles(root, allFiles);
    }
  }

  console.log(`Đã tìm thấy ${allFiles.length} file .html, .js, .json.`);

  const brokenFiles = [];

  for (const filePath of allFiles) {
    try {
      const content = fs.readFileSync(filePath, "utf8");
      let isBroken = false;
      const matched = [];

      for (const pattern of BROKEN_PATTERNS) {
        if (pattern.test(content)) {
          isBroken = true;
          matched.push(pattern.toString());
        }
      }

      if (isBroken) {
        brokenFiles.push({
          filePath,
          matched,
          size: content.length,
        });
      }
    } catch (e) {}
  }

  console.log(`\n⚠️ PHÁT HIỆN ${brokenFiles.length} FILE BỊ LỖI KÝ TỰ / MOJIBAKE:\n`);
  brokenFiles.forEach((b, i) => {
    console.log(`${i + 1}. ${b.filePath}`);
    console.log(`   Dấu hiệu lỗi: ${b.matched.slice(0, 3).join(", ")}`);
  });

  return brokenFiles;
}

scanAndReportUtf8();
