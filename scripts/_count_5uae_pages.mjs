import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const dir = path.dirname(fileURLToPath(import.meta.url));
process.chdir(path.resolve(dir, ".."));
for (const line of fs.readFileSync(".env", "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const i = t.indexOf("=");
  process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}
const { cfRequestFull } = await import("../src/cloudflare.js");
const acc = process.env.CLOUDFLARE_ACCOUNT_ID;
for (const proj of ["gg88-lp-5uae", "gg88-lp-5uae-5", "gg88-lp-5uae-4", "gg88-lp-5uae-3"]) {
  try {
    let page = 1;
    let all = [];
    while (true) {
      const r = await cfRequestFull(`/accounts/${acc}/pages/projects/${proj}/domains?page=${page}&per_page=50`);
      const items = r.result || [];
      all.push(...items);
      if (page >= (r.result_info?.total_pages || 1)) break;
      page++;
    }
    console.log(proj, "count", all.length, "sample", all.slice(0, 2).map((x) => x.name));
  } catch (e) {
    console.log(proj, e.message.slice(0, 80));
  }
}
