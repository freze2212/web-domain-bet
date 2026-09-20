import { Client } from "ssh2";

const cmd = `
cd /var/www/web-ten-mien
set -a; . ./.env; set +a
node --input-type=module <<'NODE'
import fs from "fs";
import { findDomainInRepos } from "./src/repo-scanner.js";
import { getDomainOwner } from "./src/ownership.js";
import { findZoneByName, tokenForZone, cfRequest } from "./src/cloudflare.js";

const domains = ["gg883.win", "quocte.bio"];
const hist = JSON.parse(fs.readFileSync("./data/history.json","utf8"));

async function probe(domain) {
  const out = { domain };
  out.owner = getDomainOwner(domain);
  const hits = hist.filter(h => String(h.domain||"").toLowerCase().replace(/^www\\./,"")===domain)
    .sort((a,b)=>String(b.timestamp||"").localeCompare(String(a.timestamp||"")));
  out.hist = hits.slice(0,4).map(h => ({
    ts: h.timestamp, status: h.status, action: h.actionType,
    tpl: h.templateId || h.templateName, link: h.link, err: (h.error||"").slice(0,180), cname: h.cnameTarget
  }));
  out.repos = [];
  for (const m of findDomainInRepos(domain)) {
    try {
      const j = JSON.parse(fs.readFileSync(m.filePath,"utf8"));
      const e = j[domain] || j["www."+domain];
      out.repos.push({ path: m.filePath.replace("/var/www/Landingpages/",""), link: e?.main_url || e });
    } catch {}
  }
  try {
    const dj = await fetch("https://"+domain+"/domains.json", { signal: AbortSignal.timeout(15000), headers: {"user-agent":"Mozilla/5.0"} });
    out.liveHttp = dj.status;
    if (dj.ok) {
      const j = await dj.json();
      const e = j[domain] || j["www."+domain];
      out.liveLink = e?.main_url || e || null;
      out.liveHas = !!(e);
    }
  } catch (e) { out.liveErr = e.message; }
  const zone = await findZoneByName(domain).catch(()=>null);
  if (zone) {
    const recs = await cfRequest("/zones/"+zone.id+"/dns_records", { token: tokenForZone(zone) }).catch(()=>[]);
    out.dns = (Array.isArray(recs)?recs:[]).filter(r => ["A","CNAME"].includes(r.type) && (r.name===domain || r.name==="www."+domain)).map(r=>({type:r.type,name:r.name,content:r.content}));
  }
  // mx domains.json
  try {
    const mx = JSON.parse(fs.readFileSync("/var/www/Landingpages/GG88/lp-gg88-mx/domains.json","utf8"));
    out.inMx = !!(mx[domain] || mx["www."+domain]);
    out.mxLink = (mx[domain] || mx["www."+domain] || {})?.main_url;
  } catch {}
  console.log(JSON.stringify(out, null, 2));
  console.log("----");
}
for (const d of domains) await probe(d);
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
