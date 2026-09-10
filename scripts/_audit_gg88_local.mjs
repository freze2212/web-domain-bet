import fs from "fs";
import path from "path";

const ROOT = "C:\\Landingpages\\GG88";
const OUT = "C:\\FREZE-PRJ\\web-tên-miền\\data\\_gg88_audit_local.json";

const FOLDER_TO_PAGES = {
  ldpape_4d: { pages: "lp-gg88-vip-2", expectedCnames: ["lp-gg88-vip-2.pages.dev", "lp-gg88-vip.pages.dev", "lp-gg88-vip-3.pages.dev", "lp-gg88-vip-5.pages.dev", "lp-gg88-vip-6.pages.dev", "landing-page-uae.pages.dev", "landingpage-4d-gg.pages.dev"] },
  "ldpape_4d-5-quocgia": { pages: "gg88-lp-5uae", expectedCnames: ["gg88-lp-5uae.pages.dev", "gg88-lp-5uae-2.pages.dev", "gg88-lp-5uae-3.pages.dev"] },
  "lp-gg88-mx": { pages: "lp-gg88-mx", expectedCnames: ["lp-gg88-mx.pages.dev"] },
  "lp-gg88-gt9": { pages: "lp-gg88-gt9", expectedCnames: ["lp-gg88-gt9.pages.dev"] },
  "3f-thanhnhan": { pages: "landingpage-5f-g", expectedCnames: ["landingpage-5f-g-f3x.pages.dev", "landingpage-5f-g.pages.dev", "landingpage-5f-gg88.pages.dev"] },
  "landing-page-5f": { pages: "landingpage-5f-gg88", expectedCnames: ["landingpage-5f-gg88.pages.dev"] },
  "landing-page-5f-phi": { pages: "landingpage-5f-gg88", expectedCnames: ["landingpage-5f-gg88.pages.dev"] },
  "landingpage-5h-gg": { pages: "lp-5h-gg88", expectedCnames: ["lp-5h-gg88-d6b.pages.dev", "lp-5h-gg88.pages.dev"] },
  "ld-gg882pro": { pages: "lp-gg882pro", expectedCnames: ["lp-gg882pro.pages.dev", "xroric.pages.dev"] },
  "lp-1-page-gg88": { pages: "lp-1-page-gg88", expectedCnames: ["lp-1-page-gg88.pages.dev"] },
  "lp-3c-gg88-fly88": { pages: "lp-3c-gg88-fly88", expectedCnames: ["lp-3c-gg88-fly88.pages.dev"] },
  "lp-gg88-fly88": { pages: "lp-gg88-fly88", expectedCnames: ["lp-gg88-fly88.pages.dev"] },
  "lp-c168-xoamaan": { pages: "lp-gg88-c168-qte", expectedCnames: ["lp-gg88-c168-qte.pages.dev"] },
  "ldpage-xoamaan": { pages: "lp-gg88-xoamaan", expectedCnames: ["lp-gg88-xoamaan.pages.dev"] },
  "landingpage-xoamaan-4d": { pages: "lp-gg88-xoamaan", expectedCnames: ["lp-gg88-xoamaan.pages.dev"] },
  "LP-XOATONG.NET": { pages: "lp-xoatong-net", expectedCnames: ["lp-xoatong-net.pages.dev"] },
  "lp-xoaipan-9d-g": { pages: "lp-9d-xoaip-gg88", expectedCnames: ["lp-9d-xoaip-gg88-4va.pages.dev"] },
  "landingPage-9d": { pages: "lp-9d-xoaip-gg88", expectedCnames: ["lp-9d-xoaip-gg88-4va.pages.dev"] },
};

const SKIP_DIR = new Set(["node_modules", ".git", "dist", "build", "backups", "screenshots", "tool", "data", "landingBase", "langding-base-3f", "lp-lixigg88", "lp-mm88-dt88"]);

function walk(dir, out = []) {
  let ents;
  try {
    ents = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const ent of ents) {
    if (SKIP_DIR.has(ent.name)) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.name === "domains.json") out.push(p);
  }
  return out;
}

function parseLoose(jsonText) {
  try {
    return JSON.parse(jsonText);
  } catch {
    /* duplicate keys */
  }
  const map = {};
  const re = /"([^"]+)"\s*:\s*(\{(?:[^{}]|\{[^{}]*\})*\}|"[^"]*")/g;
  let m;
  while ((m = re.exec(jsonText))) {
    const key = m[1].toLowerCase();
    try {
      const val = JSON.parse(m[2]);
      map[key] = typeof val === "string" ? { main_url: val } : val;
    } catch {
      /* skip */
    }
  }
  return map;
}

function linkOf(entry) {
  if (!entry) return "";
  if (typeof entry === "string") return entry;
  return entry.main_url || entry.url || entry.link || "";
}

const files = walk(ROOT);
const byDomain = new Map();

for (const f of files) {
  const folderName = path.basename(path.dirname(f));
  const text = fs.readFileSync(f, "utf8");
  const dj = parseLoose(text);
  for (const [dom, entry] of Object.entries(dj)) {
    const d = String(dom).toLowerCase().replace(/^www\./, "");
    if (!d.includes(".") || d === "default") continue;
    if (!byDomain.has(d)) byDomain.set(d, []);
    byDomain.get(d).push({
      folder: folderName,
      link: linkOf(entry),
      file: f,
      expected: FOLDER_TO_PAGES[folderName] || null,
    });
  }
}

const inv = [];
let multiFolder = 0;
let multiLink = 0;
const conflicts = [];

for (const [d, arr] of byDomain) {
  const folders = [...new Set(arr.map((a) => a.folder))];
  const links = [...new Set(arr.map((a) => a.link).filter(Boolean))];
  if (folders.length > 1) multiFolder++;
  if (links.length > 1) multiLink++;
  if (folders.length > 1 || links.length > 1) {
    conflicts.push({ domain: d, folders, links });
  }
  inv.push({
    domain: d,
    folders,
    links,
    primaryFolder: arr[0].folder,
    primaryLink: arr[0].link,
    expectedPages: (FOLDER_TO_PAGES[arr[0].folder] || {}).pages || null,
    expectedCnames: (FOLDER_TO_PAGES[arr[0].folder] || {}).expectedCnames || [],
  });
}

inv.sort((a, b) => a.domain.localeCompare(b.domain));
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), total: inv.length, multiFolder, multiLink, conflicts: conflicts.slice(0, 100), domains: inv }, null, 2));

console.log(JSON.stringify({
  files: files.length,
  uniqueDomains: inv.length,
  multiFolder,
  multiLink,
  conflictSample: conflicts.slice(0, 15),
  byFolder: Object.fromEntries(
    Object.entries(
      inv.reduce((acc, x) => {
        acc[x.primaryFolder] = (acc[x.primaryFolder] || 0) + 1;
        return acc;
      }, {})
    ).sort((a, b) => b[1] - a[1])
  ),
}, null, 2));
