import { Client } from "ssh2";
const c = new Client();
c.on("ready", () => {
  c.exec(`
cd /var/www/web-ten-mien
node --input-type=module <<'NODE'
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
for (const line of fs.readFileSync(".env","utf8").split(/\\n/)) {
  const t=line.trim(); if(!t||t.startsWith("#")||!t.includes("=")) continue;
  const i=t.indexOf("="); const k=t.slice(0,i).trim(); let v=t.slice(i+1).trim();
  if ((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'"))) v=v.slice(1,-1);
  if(!(k in process.env)) process.env[k]=v;
}
import { findZoneByName, tokenForZone, getAllPagesProjectsForAccount } from "./src/cloudflare.js";
import { listTemplates } from "./src/templates.js";

const token=process.env.CLOUDFLARE_API_TOKEN;
const freze=process.env.CLOUDFLARE_ACCOUNT_ID;
const admin=process.env.CLOUDFLARE_ADMIN_ACCOUNT_ID;
const adminTok=process.env.CLOUDFLARE_ADMIN_API_TOKEN||token;

async function pagesMeta(acc, tok, name, label){
  const r=await fetch("https://api.cloudflare.com/client/v4/accounts/"+acc+"/pages/projects/"+encodeURIComponent(name),{headers:{Authorization:"Bearer "+tok}});
  const j=await r.json();
  if (!j.success) { console.log(label, name, "MISSING/ERR", JSON.stringify(j.errors||[]).slice(0,160)); return null; }
  const p=j.result;
  const src=(p.source?.config?.owner||"")+"/"+(p.source?.config?.repo_name||"");
  console.log("\\n"+label, name);
  console.log("  source", p.source?.type, src, "branch", p.source?.config?.production_branch);
  console.log("  subdomain", p.subdomain);
  const d=await (await fetch("https://api.cloudflare.com/client/v4/accounts/"+acc+"/pages/projects/"+encodeURIComponent(name)+"/domains",{headers:{Authorization:"Bearer "+tok}})).json();
  const domains=(d.result||[]).map(x=>({name:x.name, status:x.status}));
  console.log("  customDomains", domains.length);
  for (const x of domains) console.log("   -", x.name, x.status);
  // latest deploys
  const dep=await (await fetch("https://api.cloudflare.com/client/v4/accounts/"+acc+"/pages/projects/"+encodeURIComponent(name)+"/deployments?per_page=5",{headers:{Authorization:"Bearer "+tok}})).json();
  for (const x of (dep.result||[]).slice(0,5)) {
    console.log("  deploy", x.created_on, x.latest_stage?.name, x.latest_stage?.status,
      x.deployment_trigger?.metadata?.commit_hash?.slice(0,10),
      (x.deployment_trigger?.metadata?.commit_message||"").slice(0,70));
  }
  return {p, domains};
}

await pagesMeta(freze, token, "lp-7f-llwin-games", "FREZE");
await pagesMeta(admin, adminTok, "lp-7f-llwin-games", "ADMIN");
await pagesMeta(freze, token, "lp-7f-llwin-games-2", "FREZE");
await pagesMeta(admin, adminTok, "lp-7f-llwin-games-2", "ADMIN");

// folder lp-llwin-info vs any 7f clone
const dirs=[
  "/var/www/Landingpages/LLWIN/lp-llwin-info",
  "/var/www/Landingpages/XX88/lp-7f-xx88-games",
];
for (const dir of dirs) {
  console.log("\\n====", dir);
  if (!fs.existsSync(dir)) { console.log("missing"); continue; }
  const remote=execSync("git -C '"+dir+"' remote get-url origin",{encoding:"utf8"}).trim();
  const log=execSync("git -C '"+dir+"' log -8 --oneline --date=short --format='%h %ad %s'",{encoding:"utf8"}).trim();
  console.log("remote", remote);
  console.log(log);
  const dj=path.join(dir,"domains.json");
  if (fs.existsSync(dj)) {
    const j=JSON.parse(fs.readFileSync(dj,"utf8"));
    const apex=Object.keys(j).filter(k=>!k.startsWith("www.")).sort();
    console.log("domains", apex.length, apex.join(", "));
  }
  // logo alt / title
  const idx=path.join(dir,"index.html");
  if (fs.existsSync(idx)) {
    const html=fs.readFileSync(idx,"utf8");
    const title=(html.match(/<title[^>]*>([^<]+)/i)||[])[1];
    const logoAlt=(html.match(/alt=[\"']([^\"']*Logo[^\"']*)[\"']/i)||[])[1];
    const logoSrc=(html.match(/src=[\"']([^\"']*logo[^\"']*)[\"']/i)||[])[1];
    console.log("title", title);
    console.log("logo", logoSrc, logoAlt);
    const hasLL=/LLWIN/i.test(html);
    const hasXX=/XX88/i.test(html);
    const hasKJC=/KJC/i.test(html);
    console.log("text flags LLWIN="+hasLL, "XX88="+hasXX, "KJC="+hasKJC);
  }
}

// Compare live domains on pages project vs DNS
const meta = await pagesMeta(freze, token, "lp-7f-llwin-games", "CHECK");
if (meta?.domains?.length) {
  console.log("\\n=== DNS CNAME check for Pages custom domains ===");
  for (const d of meta.domains) {
    const name=String(d.name||"").toLowerCase().replace(/^www\\./,"");
    if (name.includes("pages.dev")) continue;
    try {
      const zone=await findZoneByName(name);
      if (!zone) { console.log(name, "NO_ZONE"); continue; }
      const tok=tokenForZone(zone);
      const recs=await (await fetch("https://api.cloudflare.com/client/v4/zones/"+zone.id+"/dns_records?per_page=50",{headers:{Authorization:"Bearer "+tok}})).json();
      const cnames=(recs.result||[]).filter(r=>r.type==="CNAME"&&(r.name===name||r.name==="www."+name));
      console.log(name, "pagesStatus="+d.status, "CNAME=", cnames.map(r=>r.name+"->"+r.content).join(" | ")||"(none)");
    } catch(e){ console.log(name, "ERR", e.message); }
  }
}

// Hub template mapping issue summary
const t=listTemplates().find(x=>x.id==="lp_7f_llwin_games");
console.log("\\n=== HUB MAP ===");
console.log({
  id:t?.id,
  folder:t?.folder,
  path:t?.path,
  pages:t?.pagesProject,
  cname:t?.cnameTarget,
  gitRepo:t?.gitRepo,
  brand:t?.brand,
});
NODE
`, (e,s)=>{ let o=""; s.on("data",d=>o+=d); s.stderr.on("data",d=>o+=d); s.on("close",()=>{console.log(o);c.end();});});
}).connect({host:"103.146.22.218",username:"root",password:"admin123@!"});
