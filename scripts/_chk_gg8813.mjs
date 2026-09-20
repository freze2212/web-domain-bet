import { Client } from "ssh2";
const c = new Client();
c.on("ready", () => {
  c.exec(`
cd /var/www/web-ten-mien
node --input-type=module <<'NODE'
import fs from "fs";
import path from "path";
for (const line of fs.readFileSync(".env","utf8").split(/\\n/)) {
  const t=line.trim(); if(!t||t.startsWith("#")||!t.includes("=")) continue;
  const i=t.indexOf("="); const k=t.slice(0,i).trim(); let v=t.slice(i+1).trim();
  if ((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'"))) v=v.slice(1,-1);
  if(!(k in process.env)) process.env[k]=v;
}
import { findZoneByName, tokenForZone } from "./src/cloudflare.js";
import { ACTIVE_TEMPLATES } from "./src/templates.js";

const domain = "gg8813.com";
function linkOf(e){ if(!e) return null; if(typeof e==="string") return e; return e.main_url||e.messenger_url||null; }

console.log("=== LIVE ===");
for (const host of [domain, "www."+domain]) {
  try {
    const home = await fetch("https://"+host+"/", { headers:{"user-agent":"Mozilla/5.0","cache-control":"no-cache"}, redirect:"manual", signal:AbortSignal.timeout(15000)});
    const loc = home.headers.get("location");
    const html = home.status===200 ? await home.text() : "";
    const title=(html.match(/<title[^>]*>([^<]+)/i)||[])[1]||"";
    let dj=null;
    try {
      const j = await (await fetch("https://"+host+"/domains.json?v="+Date.now(), {headers:{"user-agent":"Mozilla/5.0","cache-control":"no-cache"}, signal:AbortSignal.timeout(15000)})).json();
      dj = linkOf(j[domain]||j["www."+domain]);
      console.log(host, "HTTP", home.status, "loc="+loc, "title=", title.slice(0,55), "DJ=", dj, "hasKey=", !!(j[domain]||j["www."+domain]));
    } catch(e) {
      console.log(host, "HTTP", home.status, "loc="+loc, "title=", title.slice(0,55), "DJ_ERR", e.message);
    }
  } catch(e){ console.log(host, "FAIL", e.message); }
}

console.log("\\n=== DNS ===");
const zone = await findZoneByName(domain).catch(()=>null);
console.log("zone", zone?.name, "acct", zone?.account?.id?.slice(0,8));
if (zone) {
  const token = tokenForZone(zone);
  const j = await (await fetch("https://api.cloudflare.com/client/v4/zones/"+zone.id+"/dns_records?per_page=100", {headers:{Authorization:"Bearer "+token}})).json();
  for (const r of (j.result||[]).filter(x=>["A","AAAA","CNAME"].includes(x.type)&&(x.name===domain||x.name==="www."+domain))) {
    console.log(r.type, r.name, "->", r.content, "proxied="+r.proxied);
  }
  const pr = await (await fetch("https://api.cloudflare.com/client/v4/zones/"+zone.id+"/pagerules?status=active", {headers:{Authorization:"Bearer "+token}})).json().catch(()=>({result:[]}));
  console.log("pagerules", (pr.result||[]).length);
  for (const p of (pr.result||[]).slice(0,3)) console.log(" PR", JSON.stringify(p.actions)?.slice(0,120));
}

console.log("\\n=== HISTORY ===");
const hist = JSON.parse(fs.readFileSync("data/history.json","utf8"));
const items = Array.isArray(hist)?hist:hist.items||[];
const hh = items.filter(x=>String(x.domain||"").toLowerCase().replace(/^www\\./,"")==="gg8813.com").sort((a,b)=>String(b.timestamp).localeCompare(String(a.timestamp)));
for (const x of hh.slice(0,8)) {
  console.log(x.timestamp, x.actionType, x.status, x.liveStatus||"", x.templateId||"", x.link||"", x.cnameTarget||"", x.error||x.lastCheckError||"");
}

console.log("\\n=== LOCAL JSON ===");
for (const t of ACTIVE_TEMPLATES) {
  const dir = "/var/www/Landingpages/GG88/" + t.folder;
  const f = path.join(dir, "domains.json");
  if (!fs.existsSync(f)) continue;
  try {
    const j = JSON.parse(fs.readFileSync(f,"utf8"));
    if (j[domain] || j["www."+domain]) console.log(t.id, t.pagesProject, linkOf(j[domain]||j["www."+domain]));
  } catch {}
}

const own = JSON.parse(fs.readFileSync("data/domain_ownership.json","utf8"));
console.log("\\n=== OWNERSHIP ===", JSON.stringify(own[domain]||own["www."+domain]||null));
NODE
`, (e,s)=>{ let o=""; s.on("data",d=>o+=d); s.stderr.on("data",d=>o+=d); s.on("close",()=>{console.log(o);c.end();});});
}).connect({host:"103.146.22.218",username:"root",password:"admin123@!"});
