import { Client } from "ssh2";
const c = new Client();
c.on("ready", () => {
  c.exec(`
dig +short gg8813.com NS @1.1.1.1
dig +short gg8813.com A @1.1.1.1
dig +short www.gg8813.com CNAME @1.1.1.1
dig +short gg8813.com CNAME @1.1.1.1
whois gg8813.com 2>/dev/null | grep -iE 'Name Server|Registrar|Expir|status' | head -15

cd /var/www/web-ten-mien
node --input-type=module <<'NODE'
import fs from "fs";
for (const line of fs.readFileSync(".env","utf8").split(/\\n/)) {
  const t=line.trim(); if(!t||t.startsWith("#")||!t.includes("=")) continue;
  const i=t.indexOf("="); const k=t.slice(0,i).trim(); let v=t.slice(i+1).trim();
  if ((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'"))) v=v.slice(1,-1);
  if(!(k in process.env)) process.env[k]=v;
}
import { findZoneByName, tokenForZone } from "./src/cloudflare.js";
const domain="gg8813.com";
const zone = await findZoneByName(domain);
console.log("zone", zone?.id, zone?.status, zone?.name_servers, "acct", zone?.account?.id);
const token = tokenForZone(zone);
const j = await (await fetch("https://api.cloudflare.com/client/v4/zones/"+zone.id+"/dns_records?per_page=100", {headers:{Authorization:"Bearer "+token}})).json();
console.log("dns success", j.success, "count", (j.result||[]).length, "err", JSON.stringify(j.errors||[]));
for (const r of (j.result||[])) console.log(r.type, r.name, "->", r.content, "proxied="+r.proxied);

// pages domain search freze
const freze=process.env.CLOUDFLARE_ACCOUNT_ID;
const admin=process.env.CLOUDFLARE_ADMIN_ACCOUNT_ID;
const tokF=process.env.CLOUDFLARE_API_TOKEN;
const tokA=process.env.CLOUDFLARE_ADMIN_API_TOKEN;
async function findOnPages(acc, tok, label){
  const list=await (await fetch("https://api.cloudflare.com/client/v4/accounts/"+acc+"/pages/projects?per_page=50",{headers:{Authorization:"Bearer "+tok}})).json();
  // too many - just check vip projects
  const names=(list.result||[]).map(p=>p.name).filter(n=>/vip/i.test(n));
  console.log(label, "vip projects sample", names.slice(0,10));
  for (const name of ["lp-gg88-vip-9","lp-gg88-vip-8","lp-gg88-vip-2","lp-gg88-vip"]) {
    const d=await (await fetch("https://api.cloudflare.com/client/v4/accounts/"+acc+"/pages/projects/"+name+"/domains",{headers:{Authorization:"Bearer "+tok}})).json();
    const hit=(d.result||[]).filter(x=>String(x.name).includes("gg8813"));
    if (hit.length) console.log(label, name, hit);
  }
}
await findOnPages(freze, tokF, "FREZE");
NODE
`, (e,s)=>{ let o=""; s.on("data",d=>o+=d); s.stderr.on("data",d=>o+=d); s.on("close",()=>{console.log(o);c.end();});});
}).connect({host:"103.146.22.218",username:"root",password:"admin123@!"});
