import { Client } from "ssh2";
const cmd = `
cd /var/www/web-ten-mien
set -a; . ./.env; set +a
node --input-type=module <<'NODE'
import { findZoneByName, tokenForZone, cfRequest, getPrimaryAccountId } from "./src/cloudflare.js";
import { findTemplateByDomain, listTemplates } from "./src/templates.js";

const domain = "gg88sgp.com";
const zone = await findZoneByName(domain);
console.log("zone", zone?.id, zone?.account?.name, zone?.status);
const recs = await cfRequest("/zones/"+zone.id+"/dns_records", { token: tokenForZone(zone) });
console.log("dns", (recs||[]).filter(r=>["A","CNAME"].includes(r.type)&&(r.name===domain||r.name==="www."+domain)).map(r=>({t:r.type,n:r.name,c:r.content})));

const tpl = findTemplateByDomain(domain);
console.log("findTemplateByDomain", tpl && {id:tpl.id, pages:tpl.pagesProject, path:tpl.path, cname:tpl.cnameTarget});

// which pages project has this domain?
const acc = getPrimaryAccountId();
const admin = process.env.CLOUDFLARE_ADMIN_ACCOUNT_ID;
for (const [label, token, accId] of [
  ["freze", process.env.CLOUDFLARE_API_TOKEN, acc],
  ["admin", process.env.CLOUDFLARE_ADMIN_API_TOKEN, admin || acc],
]) {
  if (!token || !accId) continue;
  try {
    let page=1, found=[];
    while (page<=5) {
      const r = await fetch("https://api.cloudflare.com/client/v4/accounts/"+accId+"/pages/projects?page="+page+"&per_page=50", {headers:{Authorization:"Bearer "+token}});
      const j = await r.json();
      const list = j.result || [];
      if (!list.length) break;
      for (const p of list) {
        const domains = p.domains || [];
        // also try fetch domains endpoint if needed
        if (JSON.stringify(p).toLowerCase().includes("gg88sgp")) found.push(p.name);
      }
      if (list.length < 50) break;
      page++;
    }
    console.log(label, "scan_hit", found);
  } catch(e) { console.log(label, e.message); }
}

// direct check known projects
const candidates = ["landingpage-5f-g","lp-5h-gg88","lp-gg88-vip-2","lp-gg88-vip-8","lp-gg88-mx-git2","3f-thanhnhan","landing-page-5f"];
for (const proj of candidates) {
  for (const [label, token, accId] of [["freze", process.env.CLOUDFLARE_API_TOKEN, acc]]) {
    try {
      const r = await fetch("https://api.cloudflare.com/client/v4/accounts/"+accId+"/pages/projects/"+encodeURIComponent(proj)+"/domains", {headers:{Authorization:"Bearer "+token}});
      const j = await r.json();
      const hits = (j.result||[]).filter(d => String(d.name||"").includes("gg88sgp"));
      if (hits.length) console.log("PAGES", proj, hits.map(h=>({name:h.name,status:h.status})));
    } catch {}
  }
}
NODE
`;
const c = new Client();
c.on("ready", () => {
  c.exec(cmd, (e,s)=>{ let o=""; s.on("data",d=>o+=d); s.stderr.on("data",d=>o+=d); s.on("close",()=>{console.log(o);c.end();}); });
}).connect({host:"103.146.22.218",username:"root",password:"admin123@!"});
