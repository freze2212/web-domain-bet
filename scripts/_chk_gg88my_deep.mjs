import { Client } from "ssh2";
const c = new Client();
c.on("ready", () => {
  c.exec(`
tail -80 /tmp/_cleanup_3f_5f.log 2>/dev/null || echo NO_LOG
echo '===='
cd /var/www/web-ten-mien
node --input-type=module <<'NODE'
import fs from "fs";
for (const line of fs.readFileSync(".env","utf8").split(/\\n/)){
  const t=line.trim(); if(!t||t.startsWith("#")||!t.includes("=")) continue;
  const i=t.indexOf("="); const k=t.slice(0,i).trim(); const v=t.slice(i+1).trim();
  if(!(k in process.env)) process.env[k]=v;
}
import { findZoneByName, tokenForZone, cfRequest, getAllPagesProjectsForAccount } from "./src/cloudflare.js";

const domains = ["gg88my.com","gg88sgp.com","gg88usa.net","ggtong.me","ggquocte.net"];

for (const d of domains) {
  const zone = await findZoneByName(d).catch(()=>null);
  console.log("\\n===", d, "zone", zone?.id, zone?.name, "acct", zone?.account?.id || zone?.accountId);
  if (!zone) continue;
  const token = tokenForZone(zone);
  const recs = await cfRequest(\`/zones/\${zone.id}/dns_records?per_page=100\`, { token });
  const interesting = (recs.result||[]).filter(r => {
    const n = (r.name||"").toLowerCase();
    return n === d || n === "www."+d || n.endsWith("."+d);
  }).filter(r => ["A","AAAA","CNAME"].includes(r.type));
  for (const r of interesting.slice(0,12)) {
    console.log(" DNS", r.type, r.name, "->", r.content, "proxied="+r.proxied);
  }
}

const aid = process.env.CLOUDFLARE_ADMIN_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID;
const freze = process.env.CLOUDFLARE_ACCOUNT_ID;
console.log("\\nadmin", aid, "freze", freze);

async function findDomainOnPages(accountId, label) {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const projs = await getAllPagesProjectsForAccount(accountId).catch(e => { console.log("list fail", label, e.message); return []; });
  const want = new Set(domains.concat(domains.map(x=>"www."+x)));
  const hits = [];
  for (const p of projs) {
    const name = p.name;
    const url = \`https://api.cloudflare.com/client/v4/accounts/\${accountId}/pages/projects/\${name}/domains\`;
    const r = await fetch(url, { headers: { Authorization: "Bearer "+token }});
    const j = await r.json();
    for (const d of (j.result||[])) {
      if (want.has(String(d.name||"").toLowerCase())) hits.push({proj:name, domain:d.name, status:d.status, account:label});
    }
  }
  console.log("pages hits", label, hits.length, JSON.stringify(hits));
}
await findDomainOnPages(aid, "admin");
if (freze && freze !== aid) await findDomainOnPages(freze, "freze");

// live checks
for (const d of ["gg88my.com","gg88sgp.com","gg88usa.net"]) {
  try {
    const html = await (await fetch("https://"+d+"/", { signal: AbortSignal.timeout(15000), headers: {"cache-control":"no-cache"} })).text();
    const title = (html.match(/<title[^>]*>([^<]+)/i)||[])[1]||"";
    const h1 = (html.match(/<h1[^>]*>([^<]+)/i)||[])[1]||"";
    let link = null;
    try {
      const j = await (await fetch("https://"+d+"/domains.json?v="+Date.now(), { signal: AbortSignal.timeout(15000) })).json();
      const e = j[d] || j["www."+d];
      link = e?.main_url || null;
      console.log("LIVE", d, "title=", title.slice(0,60), "h1=", h1.slice(0,60), "link=", link, "keys_sample=", Object.keys(j).filter(k=>!k.startsWith("www.")).slice(0,5));
    } catch(e) {
      console.log("LIVE", d, "title=", title.slice(0,60), "domains.json fail", e.message);
    }
  } catch(e) { console.log("LIVE fail", d, e.message); }
}

// local 5f json
const j5 = JSON.parse(fs.readFileSync("/var/www/Landingpages/GG88/landing-page-5f/domains.json","utf8"));
console.log("5f has gg88my", j5["gg88my.com"], "sgp", !!j5["gg88sgp.com"], "usa", !!j5["gg88usa.net"]);
NODE
`, (e,s)=>{ let o=""; s.on("data",d=>o+=d); s.stderr.on("data",d=>o+=d); s.on("close",()=>{console.log(o);c.end();}); });
}).connect({host:"103.146.22.218",username:"root",password:"admin123@!"});
