import { Client } from "ssh2";
const c = new Client();
c.on("ready", () => {
  c.exec(`
set -e
echo '=== LIVE pages.dev ==='
curl -sS -A 'Mozilla/5.0' -H 'Cache-Control: no-cache' 'https://lp-7f-llwin-games.pages.dev/' | tr '\\n' ' ' | sed 's/>/>\\n/g' | grep -iE 'logo|llwin|kjc|img src|brand' | head -40

echo ''
echo '=== LOCAL / VPS folder ==='
ls -la /var/www/Landingpages/LLWIN 2>/dev/null | head -30
ls -la /var/www/Landingpages/GG88 2>/dev/null | grep -i 7f || true
find /var/www/Landingpages -maxdepth 3 -type d -iname '*7f*llwin*' 2>/dev/null
find /var/www/Landingpages -maxdepth 3 -type d -iname '*llwin*games*' 2>/dev/null

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
import { ACTIVE_TEMPLATES, listTemplates } from "./src/templates.js";

const tpls = listTemplates().filter(t =>
  /7f|llwin.games|llwin-games/i.test([t.id,t.folder,t.pagesProject,t.gitRepo,t.name].join(" "))
);
console.log("=== TEMPLATES MATCH ===");
for (const t of tpls) {
  console.log(JSON.stringify({
    id:t.id, folder:t.folder, path:t.path, gitRepo:t.gitRepo,
    pages:t.pagesProject, cname:t.cnameTarget, brand:t.brand, sample:t.sampleDomain
  },null,2));
}

const candidates = [];
for (const t of tpls) if (t.path) candidates.push(t.path);
for (const p of [
  "/var/www/Landingpages/LLWIN/lp-7f-llwin-games",
  "/var/www/Landingpages/LLWIN/lp-7f-xx88-games",
  "/var/www/Landingpages/XX88/lp-7f-xx88-games",
  "/var/www/Landingpages/GG88/lp-7f-llwin-games",
]) if (fs.existsSync(p)) candidates.push(p);

const uniq=[...new Set(candidates)];
for (const dir of uniq) {
  console.log("\\n=== DIR", dir, "===");
  if (!fs.existsSync(dir)) { console.log("MISSING"); continue; }
  try {
    const remote = execSync("git -C "+JSON.stringify(dir)+" remote get-url origin",{encoding:"utf8"}).trim();
    const log = execSync("git -C "+JSON.stringify(dir)+" log -5 --oneline",{encoding:"utf8"}).trim();
    const br = execSync("git -C "+JSON.stringify(dir)+" rev-parse --abbrev-ref HEAD",{encoding:"utf8"}).trim();
    console.log("remote", remote);
    console.log("branch", br);
    console.log(log);
  } catch(e){ console.log("git err", e.message); }

  // logos / brand in html/css/js
  const files = [];
  function walk(d, depth=0){
    if (depth>3) return;
    for (const name of fs.readdirSync(d)) {
      if (name===".git"||name==="node_modules") continue;
      const p=path.join(d,name);
      const st=fs.statSync(p);
      if (st.isDirectory()) walk(p, depth+1);
      else if (/\\.(html|css|js|json|svg|png|jpg|webp)$/i.test(name)) files.push(p);
    }
  }
  walk(dir);
  const logoFiles = files.filter(f=>/logo/i.test(path.basename(f)));
  console.log("logo files", logoFiles.map(f=>f.replace(dir,"")));
  for (const f of files.filter(f=>/index\\.html$/i.test(f)).slice(0,2)) {
    const html=fs.readFileSync(f,"utf8");
    const imgs=[...html.matchAll(/src=[\"']([^\"']*logo[^\"']*)[\"']/gi)].map(m=>m[1]);
    const alts=[...html.matchAll(/alt=[\"']([^\"']*)[\"']/gi)].map(m=>m[1]).filter(a=/llwin|kjc|xx88|logo/i.test(a));
    const brands=[...html.matchAll(/LLWIN|KJC|XX88/g)].slice(0,20).map(m=>m[0]);
    console.log("index", f.replace(dir,""), "img logos", imgs.slice(0,8), "alts", alts.slice(0,8), "brand hits", [...new Set(brands)]);
  }

  const djPath=path.join(dir,"domains.json");
  if (fs.existsSync(djPath)) {
    const j=JSON.parse(fs.readFileSync(djPath,"utf8"));
    const apex=Object.keys(j).filter(k=>!k.startsWith("www.")).sort();
    console.log("domains.json count", apex.length);
    console.log("sample", apex.slice(0,15).join(", "));
  } else console.log("no domains.json");
}

// CF Pages project meta
const token=process.env.CLOUDFLARE_API_TOKEN;
const freze=process.env.CLOUDFLARE_ACCOUNT_ID;
const admin=process.env.CLOUDFLARE_ADMIN_ACCOUNT_ID;
const adminTok=process.env.CLOUDFLARE_ADMIN_API_TOKEN||token;
async function pagesMeta(acc, tok, name, label){
  const r=await fetch("https://api.cloudflare.com/client/v4/accounts/"+acc+"/pages/projects/"+name,{headers:{Authorization:"Bearer "+tok}});
  const j=await r.json();
  if (!j.success) { console.log(label, name, "ERR", JSON.stringify(j.errors).slice(0,120)); return null; }
  const p=j.result;
  console.log(label, name, "source", p.source?.type, (p.source?.config?.owner||"")+"/"+(p.source?.config?.repo_name||""), "branch", p.source?.config?.production_branch, "sub", p.subdomain);
  const d=await (await fetch("https://api.cloudflare.com/client/v4/accounts/"+acc+"/pages/projects/"+name+"/domains",{headers:{Authorization:"Bearer "+tok}})).json();
  const domains=(d.result||[]).map(x=>x.name+":"+x.status);
  console.log(label, name, "customDomains", domains.length);
  console.log(domains.slice(0,30).join(" | "));
  return {p, domains:d.result||[]};
}
await pagesMeta(freze, token, "lp-7f-llwin-games", "FREZE");
await pagesMeta(admin, adminTok, "lp-7f-llwin-games", "ADMIN");
await pagesMeta(freze, token, "lp-7f-llwin-games-2", "FREZE");
NODE
`, (e,s)=>{ let o=""; s.on("data",d=>o+=d); s.stderr.on("data",d=>o+=d); s.on("close",()=>{console.log(o);c.end();});});
}).connect({host:"103.146.22.218",username:"root",password:"admin123@!"});
