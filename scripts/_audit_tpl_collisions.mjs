import { Client } from "ssh2";

const cmd = `
cd /var/www/web-ten-mien
set -a; . ./.env; set +a
node --input-type=module <<'NODE'
import fs from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import { listTemplates } from "./src/templates.js";
import { findZoneByName, tokenForZone, cfRequest } from "./src/cloudflare.js";

const execAsync = promisify(exec);
const tpls = listTemplates();

// 1) Collision: same pagesProject / cname / gitRepo claimed by multiple templates
function collisions(keyFn, label) {
  const map = new Map();
  for (const t of tpls) {
    const k = keyFn(t);
    if (!k) continue;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(t.id);
  }
  const bad = [...map.entries()].filter(([, ids]) => ids.length > 1);
  console.log("\\n=== COLLISIONS", label, bad.length, "===");
  for (const [k, ids] of bad) console.log(k, "->", ids.join(", "));
  return bad;
}

collisions((t) => (t.pagesProject || "").toLowerCase(), "pagesProject");
collisions((t) => (t.cnameTarget || "").toLowerCase().replace(/\\.pages\\.dev$/,""), "cnameTarget");
collisions((t) => (t.gitRepo || "").toLowerCase(), "gitRepo");

// 2) landingpage_5f_g still correct?
const t5 = tpls.find((t) => t.id === "landingpage_5f_g");
const t3 = tpls.find((t) => t.id === "ladpage_3f_nhannhan");
console.log("\\n=== 5F template ===", { id: t5?.id, pages: t5?.pagesProject, git: t5?.gitRepo, path: t5?.path });
console.log("=== 3F template ===", { id: t3?.id, pages: t3?.pagesProject, git: t3?.gitRepo, path: t3?.path });

// 3) Domains in 3f local json whose DNS is actually 5f (wrong writes)
const p3 = "/var/www/Landingpages/GG88/3f-thanhnhan/domains.json";
const p5 = "/var/www/Landingpages/GG88/landing-page-5f/domains.json";
const j3 = JSON.parse(fs.readFileSync(p3, "utf8"));
const j5 = JSON.parse(fs.readFileSync(p5, "utf8"));
const apex3 = [...new Set(Object.keys(j3).map((k) => k.replace(/^www\\./, "")))];
console.log("\\n3f local apex count", apex3.length);
console.log("5f local apex count", [...new Set(Object.keys(j5).map((k)=>k.replace(/^www\\./,"")))].length);

// sample check CNAME for domains only in 3f or mismatch
const suspects = [];
for (const d of apex3.slice(0, 80)) { // cap API
  try {
    const zone = await findZoneByName(d);
    if (!zone) continue;
    const recs = await cfRequest("/zones/"+zone.id+"/dns_records", { token: tokenForZone(zone) });
    const cname = (recs||[]).find((r) => r.type === "CNAME" && (r.name === d || r.name === "www."+d));
    const target = (cname?.content || "").toLowerCase();
    if (target.includes("landingpage-5f-g")) {
      const in5 = !!(j5[d] || j5["www."+d]);
      const link3 = (j3[d] || j3["www."+d] || {})?.main_url;
      const link5 = (j5[d] || j5["www."+d] || {})?.main_url;
      suspects.push({ d, target, in5, link3, link5, same: link3 === link5 });
    }
  } catch {}
}
console.log("\\n=== 3f-json domains whose CNAME is landingpage-5f-g (sampled first 80 of 3f list) ===");
console.log("count", suspects.length);
for (const s of suspects.slice(0, 30)) {
  console.log(s.d, "in5fJson="+s.in5, "linksSame="+s.same, "liveWouldUse5f");
}

// 4) git remote truth
for (const p of [p3.replace("/domains.json",""), p5.replace("/domains.json","")]) {
  const { stdout } = await execAsync("git remote get-url origin && git rev-parse --abbrev-ref HEAD", { cwd: p });
  console.log("remote", p, stdout.trim().replace(/\\n/g," | "));
}
NODE
`;

const c = new Client();
c.on("ready", () => {
  c.exec(cmd, (e, s) => {
    let o = "";
    s.on("data", (d) => (o += d.toString()));
    s.stderr.on("data", (d) => (o += d.toString()));
    s.on("close", () => {
      console.log(o || "(empty)");
      c.end();
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
