import { Client } from "ssh2";
const cmd = `
cd /var/www/web-ten-mien
set -a; . ./.env; set +a
node --input-type=module <<'NODE'
import fs from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import { findZoneByName, tokenForZone, cfRequest } from "./src/cloudflare.js";
const execAsync = promisify(exec);

const p3="/var/www/Landingpages/GG88/3f-thanhnhan";
const p5="/var/www/Landingpages/GG88/landing-page-5f";

console.log("=== GIT ===");
for (const p of [p3,p5]) {
  const {stdout} = await execAsync("git remote get-url origin; git rev-parse --abbrev-ref HEAD; git log -1 --oneline", {cwd:p});
  console.log(p.split("/").slice(-1)[0], "->", stdout.trim().replace(/\\n/g," | "));
}

function apex(j){return [...new Set(Object.keys(j).map(k=>k.toLowerCase().replace(/^www\\./,"")))].filter(Boolean).sort()}
const j3=JSON.parse(fs.readFileSync(p3+"/domains.json","utf8"));
const j5=JSON.parse(fs.readFileSync(p5+"/domains.json","utf8"));
const a3=apex(j3), a5=apex(j5);
console.log("\\n=== DOMAINS ===");
console.log("3f", a3.length, a3.join(", "));
console.log("5f", a5.length);

console.log("\\n=== 3F domains DNS/CNAME ===");
for (const d of a3) {
  try {
    const z=await findZoneByName(d);
    const recs=z?await cfRequest("/zones/"+z.id+"/dns_records",{token:tokenForZone(z)}):[];
    const cn=(recs||[]).find(r=>r.type==="CNAME"&&(r.name===d||r.name==="www."+d));
    console.log(d, "->", cn?.content || "NO_CNAME", "in5fJson="+a5.includes(d));
  } catch(e){ console.log(d, "ERR", e.message); }
}

// rough HTML fingerprint
console.log("\\n=== HTML fingerprint ===");
for (const p of [p3,p5]) {
  const html=fs.readFileSync(p+"/index.html","utf8");
  const title=(html.match(/<title[^>]*>([^<]+)/i)||[])[1]||"";
  console.log(p.split("/").slice(-1)[0], "title=", title.trim().slice(0,80), "len=", html.length);
}
NODE
`;
const c=new Client();
c.on("ready",()=>c.exec(cmd,(e,s)=>{let o="";s.on("data",d=>o+=d);s.stderr.on("data",d=>o+=d);s.on("close",()=>{console.log(o);c.end();});})).connect({host:"103.146.22.218",username:"root",password:"admin123@!"});
