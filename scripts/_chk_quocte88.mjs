import { Client } from "ssh2";

const cmd = `
cd /var/www/web-ten-mien
set -a; . ./.env; set +a
node --input-type=module <<'NODE'
import fs from "fs";
import { findDomainInRepos } from "./src/repo-scanner.js";
import { getDomainOwner } from "./src/ownership.js";
import { findZoneByName, tokenForZone, cfRequest } from "./src/cloudflare.js";
import { getTemplate, findTemplateByDomain } from "./src/templates.js";

const domain = "quocte88.us";

const owner = getDomainOwner(domain);
console.log("OWNER", owner);

const hist = JSON.parse(fs.readFileSync("./data/history.json","utf8"));
const hits = hist.filter(h => String(h.domain||"").toLowerCase().replace(/^www\\./,"")===domain)
  .sort((a,b)=>String(b.timestamp||"").localeCompare(String(a.timestamp||"")));
console.log("HIST_COUNT", hits.length);
for (const h of hits.slice(0,5)) {
  console.log("HIST", {ts:h.timestamp, status:h.status, action:h.actionType, tpl:h.templateId||h.templateName, link:h.link, progress:h.progress, err:h.error, cname:h.cnameTarget});
}

const matches = findDomainInRepos(domain);
console.log("REPO_HITS", matches.length);
for (const m of matches) {
  try {
    const j = JSON.parse(fs.readFileSync(m.filePath,"utf8"));
    const e = j[domain] || j["www."+domain];
    console.log("REPO", m.filePath.replace("/var/www/Landingpages/",""), e?.main_url || e);
  } catch(err) { console.log("REPO_ERR", m.filePath, err.message); }
}

const tpl = findTemplateByDomain(domain);
console.log("findTemplateByDomain", tpl && {id:tpl.id, name:tpl.name, pages:tpl.pagesProject, cname:tpl.cnameTarget, path:tpl.path});

// live
async function probe() {
  for (const host of [domain, "www."+domain]) {
    try {
      const r = await fetch("https://"+host+"/", {redirect:"manual", signal: AbortSignal.timeout(15000)});
      console.log("HTTP", host, r.status, r.headers.get("location"));
    } catch(e) { console.log("HTTP_ERR", host, e.message); }
    try {
      const dj = await fetch("https://"+host+"/domains.json", {signal: AbortSignal.timeout(15000), headers:{"user-agent":"Mozilla/5.0"}});
      console.log("DJ_STATUS", host, dj.status);
      if (dj.ok) {
        const j = await dj.json();
        const e = j[domain] || j["www."+domain];
        console.log("LIVE_ENTRY", e);
        // also check if default/fallback keys
        const keys = Object.keys(j).filter(k => k.includes("quocte") || k.includes("88.us"));
        console.log("RELATED_KEYS", keys.slice(0,10));
      } else {
        const t = await dj.text();
        console.log("DJ_BODY", t.slice(0,200));
      }
    } catch(e) { console.log("DJ_ERR", host, e.message); }
  }
}
await probe();

const zone = await findZoneByName(domain).catch(()=>null);
console.log("ZONE", zone && {id:zone.id, status:zone.status, account:zone.account?.name});
if (zone) {
  const recs = await cfRequest("/zones/"+zone.id+"/dns_records", {token: tokenForZone(zone)}).catch(e=>({err:e.message}));
  const relevant = (Array.isArray(recs)?recs:[]).filter(r => ["A","CNAME","AAAA"].includes(r.type) && (r.name===domain || r.name==="www."+domain || r.name==="@" || r.name==="www"));
  console.log("DNS", relevant.map(r=>({type:r.type,name:r.name,content:r.content,proxied:r.proxied})));
}
NODE
`;

const c = new Client();
c.on("ready", () => {
  c.exec(cmd, (e, s) => {
    let o = "";
    s.on("data", (d) => (o += d.toString()));
    s.stderr.on("data", (d) => (o += d.toString()));
    s.on("close", () => { console.log(o || "(empty)"); c.end(); });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
