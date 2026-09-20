import { Client } from "ssh2";
const c = new Client();
c.on("ready", () => {
  c.exec(`
cd /var/www/web-ten-mien
node --input-type=module <<'NODE'
import fs from "fs";
for (const line of fs.readFileSync(".env","utf8").split(/\\n/)){const t=line.trim();if(!t||t.startsWith("#")||!t.includes("="))continue;const i=t.indexOf("=");const k=t.slice(0,i).trim();let v=t.slice(i+1).trim();if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);if(!(k in process.env))process.env[k]=v;}
import { findZoneByName, tokenForZone } from "./src/cloudflare.js";

const want="https://gg8849.com/?id=211438962";
const z=await findZoneByName("gg883f.com");
const token=tokenForZone(z);
await fetch("https://api.cloudflare.com/client/v4/zones/"+z.id+"/purge_cache",{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({files:["https://gg883f.com/domains.json","https://www.gg883f.com/domains.json","https://gg883f.com/","https://www.gg883f.com/"]})});

async function check(host){
  const j=await (await fetch("https://"+host+"/domains.json?v="+Date.now()+"&r="+Math.random(),{headers:{"user-agent":"Mozilla/5.0","cache-control":"no-cache","pragma":"no-cache"},signal:AbortSignal.timeout(15000)})).json();
  const e=j["gg883f.com"]||j["www.gg883f.com"];
  return e?.main_url||null;
}

for (let i=0;i<8;i++){
  const a=await check("gg883f.com");
  const w=await check("www.gg883f.com");
  const p=await check("lp-gg88-vip-9.pages.dev");
  console.log("#"+i, "apex="+a, "www="+w, "pages="+p);
  if (a===want && w===want) { console.log("LIVE_OK"); break; }
  await new Promise(r=>setTimeout(r,4000));
}

// history status
const hist=JSON.parse(fs.readFileSync("data/history.json","utf8"));
const items=Array.isArray(hist)?hist:hist.items||[];
const hh=items.filter(x=>String(x.domain||"").toLowerCase()==="gg883f.com").slice(0,3);
for (const h of hh) console.log("hist", h.timestamp, h.status, h.actionType, h.link, h.cnameTarget);
NODE
`, (e,s)=>{ let o=""; s.on("data",d=>o+=d); s.stderr.on("data",d=>o+=d); s.on("close",()=>{console.log(o);c.end();});});
}).connect({host:"103.146.22.218",username:"root",password:"admin123@!"});
