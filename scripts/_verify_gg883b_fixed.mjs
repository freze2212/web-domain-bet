import { Client } from "ssh2";
const c = new Client();
c.on("ready", () => {
  c.exec(`
sleep 3
for host in www.gg883b.com gg883b.com lp-gg88-vip-8.pages.dev; do
  echo "== $host"
  curl -sS -A 'Mozilla/5.0' -H 'Cache-Control: no-cache' "https://$host/domains.json?v=$(date +%s)" | python3 -c "import sys,json;j=json.load(sys.stdin);e=j.get('gg883b.com') or j.get('www.gg883b.com'); print(e)"
done
# purge cf cache for zone
cd /var/www/web-ten-mien
node --input-type=module -e '
import fs from "fs";
for (const line of fs.readFileSync(".env","utf8").split(/\\n/)){const t=line.trim();if(!t||t.startsWith("#")||!t.includes("="))continue;const i=t.indexOf("=");const k=t.slice(0,i).trim();const v=t.slice(i+1).trim();if(!(k in process.env))process.env[k]=v;}
import { findZoneByName, tokenForZone } from "./src/cloudflare.js";
const z=await findZoneByName("gg883b.com");
const token=tokenForZone(z);
const r=await fetch("https://api.cloudflare.com/client/v4/zones/"+z.id+"/purge_cache",{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({purge_everything:true})});
console.log("purge", await r.json().then(j=>j.success));
'
`, (e,s)=>{ let o=""; s.on("data",d=>o+=d); s.stderr.on("data",d=>o+=d); s.on("close",()=>{console.log(o);c.end();});});
}).connect({host:"103.146.22.218",username:"root",password:"admin123@!"});
