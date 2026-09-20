import { Client } from "ssh2";
const c = new Client();
c.on("ready", () => {
  c.exec(`
cd /var/www/web-ten-mien
node --input-type=module <<'NODE'
import fs from "fs";
for (const line of fs.readFileSync(".env","utf8").split(/\\n/)) {
  const t=line.trim(); if(!t||t.startsWith("#")||!t.includes("=")) continue;
  const i=t.indexOf("="); const k=t.slice(0,i).trim(); let v=t.slice(i+1).trim();
  if ((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'"))) v=v.slice(1,-1);
  if(!(k in process.env)) process.env[k]=v;
}
import { findZoneByName, tokenForZone, waitForPagesDomainActive } from "./src/cloudflare.js";

const domain="gg8813.com";
const zone=await findZoneByName(domain);
const token=tokenForZone(zone);
const j=await (await fetch("https://api.cloudflare.com/client/v4/zones/"+zone.id+"/dns_records?per_page=100",{headers:{Authorization:"Bearer "+token}})).json();
for (const r of (j.result||[]).filter(x=>["A","AAAA","CNAME"].includes(x.type))) {
  console.log(r.type, r.name, "->", r.content);
}

await waitForPagesDomainActive("lp-gg88-vip-8", domain, process.env.CLOUDFLARE_ACCOUNT_ID, 120000).catch(e=>console.log("wait", e.message));

for (let i=0;i<10;i++){
  for (const host of [domain,"www."+domain]) {
    try {
      const r=await fetch("https://"+host+"/",{redirect:"manual",headers:{"user-agent":"Mozilla/5.0","cache-control":"no-cache"},signal:AbortSignal.timeout(12000)});
      let dj=null;
      try {
        const jj=await (await fetch("https://"+host+"/domains.json?v="+Date.now(),{headers:{"user-agent":"Mozilla/5.0"},signal:AbortSignal.timeout(12000)})).json();
        dj=(jj[domain]||jj["www."+domain])?.main_url||null;
      } catch(e){ dj="dj:"+e.message; }
      console.log("#"+i, host, "HTTP", r.status, "DJ", dj);
      if (dj && String(dj).includes("854954030")) { console.log("LIVE_OK"); process.exit(0); }
    } catch(e){ console.log("#"+i, host, e.message); }
  }
  await new Promise(r=>setTimeout(r,8000));
}
NODE
`, (e,s)=>{ let o=""; s.on("data",d=>o+=d); s.stderr.on("data",d=>o+=d); s.on("close",()=>{console.log(o);c.end();});});
}).connect({host:"103.146.22.218",username:"root",password:"admin123@!"});
