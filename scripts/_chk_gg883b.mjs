import { Client } from "ssh2";
const c = new Client();
c.on("ready", () => {
  c.exec(`
cd /var/www/web-ten-mien
node --input-type=module <<'NODE'
import fs from "fs";
for (const line of fs.readFileSync(".env","utf8").split(/\\n/)) {
  const t=line.trim(); if(!t||t.startsWith("#")||!t.includes("=")) continue;
  const i=t.indexOf("="); const k=t.slice(0,i).trim(); const v=t.slice(i+1).trim();
  if(!(k in process.env)) process.env[k]=v;
}
import { findZoneByName, tokenForZone } from "./src/cloudflare.js";
import { ACTIVE_TEMPLATES } from "./src/templates.js";
import path from "path";

const domain = "gg883b.com";
const want = "https://www.gg8847.com/?id=150112380";

function linkOf(e){
  if(!e) return null;
  if(typeof e==="string") return e;
  return e.main_url || e.messenger_url || null;
}

async function fetchText(url){
  const r = await fetch(url, { redirect:"manual", headers:{"user-agent":"Mozilla/5.0","cache-control":"no-cache"}, signal: AbortSignal.timeout(20000)});
  const t = await r.text().catch(()=>"");
  return { status:r.status, loc:r.headers.get("location"), len:t.length, text:t.slice(0,2500) };
}

console.log("=== LIVE ===");
for (const host of [domain, "www."+domain]) {
  try {
    const home = await fetchText("https://"+host+"/");
    const title=(home.text.match(/<title[^>]*>([^<]+)/i)||[])[1]||"";
    const h1=(home.text.match(/<h1[^>]*>([^<]+)/i)||[])[1]||"";
    console.log(host, "HOME", home.status, "title=", title.slice(0,70), "h1=", h1.slice(0,70));
    try {
      const j = await (await fetch("https://"+host+"/domains.json?v="+Date.now(), { headers:{"user-agent":"Mozilla/5.0","cache-control":"no-cache"}, signal:AbortSignal.timeout(15000)})).json();
      const e = j[domain]||j["www."+domain];
      console.log(host, "DJ", linkOf(e), "hasKey=", !!(j[domain]||j["www."+domain]), "apexSample=", Object.keys(j).filter(k=>!k.startsWith("www.")).slice(0,8));
    } catch(e){ console.log(host, "DJ_ERR", e.message); }
  } catch(e){ console.log(host, "FAIL", e.message); }
}

console.log("\\n=== DNS ===");
const zone = await findZoneByName(domain).catch(()=>null);
console.log("zone", zone?.id, zone?.name, "acct", zone?.account?.id);
if (zone) {
  const token = tokenForZone(zone);
  const j = await (await fetch("https://api.cloudflare.com/client/v4/zones/"+zone.id+"/dns_records?per_page=100", {headers:{Authorization:"Bearer "+token}})).json();
  for (const r of (j.result||[]).filter(x=>["A","AAAA","CNAME"].includes(x.type)&&(x.name===domain||x.name==="www."+domain||x.name.endsWith("."+domain)))) {
    console.log(r.type, r.name, "->", r.content, "proxied="+r.proxied);
  }
  // page rules
  const pr = await (await fetch("https://api.cloudflare.com/client/v4/zones/"+zone.id+"/pagerules?status=active", {headers:{Authorization:"Bearer "+token}})).json().catch(()=>({result:[]}));
  console.log("pagerules", (pr.result||[]).length);
  for (const p of (pr.result||[]).slice(0,5)) console.log(" PR", JSON.stringify(p.actions), p.targets?.[0]?.constraint?.value);
}

console.log("\\n=== LOCAL LP domains.json ===");
const roots = ["/var/www/Landingpages/GG88","/var/www/Landingpages"];
const hits=[];
for (const t of ACTIVE_TEMPLATES) {
  const p = t.path?.replace(/^C:\\\\Landingpages/i,"/var/www/Landingpages").replace(/\\\\/g,"/");
  // also try folder under GG88
  const candidates = [
    p,
    "/var/www/Landingpages/GG88/"+t.folder,
    "/var/www/Landingpages/"+t.folder,
  ].filter(Boolean);
  for (const dir of candidates) {
    const f = path.join(dir, "domains.json");
    if (!fs.existsSync(f)) continue;
    try {
      const j = JSON.parse(fs.readFileSync(f,"utf8"));
      if (j[domain] || j["www."+domain]) {
        hits.push({ tpl:t.id, folder:t.folder, pages:t.pagesProject, cname:t.cnameTarget, entry:j[domain]||j["www."+domain], path:f });
      }
    } catch {}
  }
}
console.log("jsonHits", hits.length);
for (const h of hits) console.log(JSON.stringify(h));

console.log("\\n=== HISTORY ===");
const hist = JSON.parse(fs.readFileSync("data/history.json","utf8"));
const items = Array.isArray(hist)?hist:hist.items||[];
const hh = items.filter(x=>String(x.domain||"").toLowerCase().includes("gg883b")).sort((a,b)=>String(b.timestamp).localeCompare(String(a.timestamp)));
console.log("hist", hh.length);
for (const x of hh.slice(0,8)) {
  console.log(x.timestamp, x.actionType, x.status, x.templateId, x.link, x.cnameTarget, x.error||x.message||"");
}

// ownership files
for (const f of ["data/domain-ownership.json","data/ownership.json","data/domains_ownership.json"]) {
  if (!fs.existsSync(f)) continue;
  const raw = JSON.parse(fs.readFileSync(f,"utf8"));
  const map = raw.domains || raw;
  const o = map[domain] || map["www."+domain];
  if (o) console.log("own", f, JSON.stringify(o));
}
NODE
`, (e,s)=>{ let o=""; s.on("data",d=>o+=d); s.stderr.on("data",d=>o+=d); s.on("close",()=>{console.log(o);c.end();});});
}).connect({host:"103.146.22.218",username:"root",password:"admin123@!"});
