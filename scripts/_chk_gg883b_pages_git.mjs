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
import { getAllPagesProjectsForAccount } from "./src/cloudflare.js";

const token = process.env.CLOUDFLARE_API_TOKEN;
const admin = process.env.CLOUDFLARE_ADMIN_ACCOUNT_ID;
const freze = process.env.CLOUDFLARE_ACCOUNT_ID;

async function findProj(accountId, label) {
  const list = await getAllPagesProjectsForAccount(accountId).catch(e=>{console.log(label,"list fail",e.message);return[]});
  const hits = (list||[]).filter(p=>/vip/i.test(p.name));
  console.log(label, "vip projects", hits.map(p=>p.name).sort().join(", "));
  for (const name of ["lp-gg88-vip-8","lp-gg88-vip-2","lp-gg88-vip","lp-gg88-vip-3","lp-gg88-vip-5","lp-gg88-vip-6"]) {
    const p = (list||[]).find(x=>x.name===name);
    if (!p) { console.log(label, name, "MISSING"); continue; }
    console.log(label, name, "source", p.source?.type, p.source?.config?.owner+"/"+p.source?.config?.repo_name, "branch", p.source?.config?.production_branch, "sub", p.subdomain);
  }
}
await findProj(admin, "ADMIN");
await findProj(freze, "FREZE");

async function liveDj(host) {
  try {
    const j = await (await fetch("https://"+host+"/domains.json?v="+Date.now(), {headers:{"user-agent":"Mozilla/5.0"}, signal:AbortSignal.timeout(15000)})).json();
    console.log(host, "gg883b=", j["gg883b.com"]||j["www.gg883b.com"]||null, "keys", Object.keys(j).length);
  } catch(e){ console.log(host, e.message); }
}
await liveDj("lp-gg88-vip-8.pages.dev");
await liveDj("lp-gg88-vip-2.pages.dev");
await liveDj("www.gg883b.com");

// git status local
import { execSync } from "child_process";
const cwd="/var/www/Landingpages/GG88/ldpape_4d";
console.log("git status", execSync("git status -sb",{cwd,encoding:"utf8"}).trim());
console.log("git log", execSync("git log -3 --oneline",{cwd,encoding:"utf8"}).trim());
try {
  console.log("origin", execSync("git rev-parse HEAD origin/main origin/master 2>/dev/null || true",{cwd,encoding:"utf8"}).trim());
} catch {}
const show = execSync("git show-ref",{cwd,encoding:"utf8"});
const remote = show.includes("refs/remotes/origin/main") ? "origin/main" : "origin/master";
console.log("remoteRef", remote, execSync("git rev-parse "+remote,{cwd,encoding:"utf8"}).trim());
console.log("HEAD has gg883b?", /gg883b/.test(execSync("git show HEAD:domains.json",{cwd,encoding:"utf8"})));
console.log("origin has gg883b?", /gg883b/.test(execSync("git show "+remote+":domains.json",{cwd,encoding:"utf8"})));
NODE
`, (e,s)=>{ let o=""; s.on("data",d=>o+=d); s.stderr.on("data",d=>o+=d); s.on("close",()=>{console.log(o);c.end();});});
}).connect({host:"103.146.22.218",username:"root",password:"admin123@!"});
