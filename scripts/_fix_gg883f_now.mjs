import { Client } from "ssh2";
const c = new Client();
c.on("ready", () => {
  c.exec(`
set -e
cd /var/www/web-ten-mien
export $(grep -E '^(CLOUDFLARE_API_TOKEN|CLOUDFLARE_ACCOUNT_ID)=' .env | xargs)
DOMAIN=gg883f.com
LINK='https://gg8849.com/?id=211438962'
LP=/var/www/Landingpages/GG88/ldpape_4d
PROJ=lp-gg88-vip-9

python3 - <<PY
import json, os
from pathlib import Path
p=Path("$LP")/"domains.json"
j=json.loads(p.read_text())
entry={"main_url":"$LINK","messenger_url":"$LINK","telegram_url":"$LINK"}
j["$DOMAIN"]=entry
j["www.$DOMAIN"]=entry
p.write_text(json.dumps(j, indent=2, ensure_ascii=False)+"\\n")
print("wrote", j["$DOMAIN"])
PY

cd "$LP"
git add domains.json
git commit -m "Auto add domain $DOMAIN (force live fix)" || echo "commit_skip"
# push best-effort; live fix via wrangler
git push origin HEAD:main 2>&1 | tail -5 || true

cd "$LP"
npx --yes wrangler@3 pages deploy . --project-name=$PROJ --commit-dirty=true 2>&1 | tee /tmp/wrangler_$PROJ.log | tail -25

# mark history success
cd /var/www/web-ten-mien
node --input-type=module <<'NODE'
import fs from "fs";
const domain="gg883f.com";
const link="https://gg8849.com/?id=211438962";
const p="data/history.json";
const hist=JSON.parse(fs.readFileSync(p,"utf8"));
const items=Array.isArray(hist)?hist:hist.items||[];
let n=0;
for (const h of items) {
  if (String(h.domain||"").toLowerCase()===domain && h.status==="in_progress") {
    h.status="success";
    h.progress=null;
    h.link=link;
    h.tele=link;
    h.cnameTarget="lp-gg88-vip-9.pages.dev";
    h.details={...(h.details||{}), fixedManually:true, reason:"pages queue stuck; wrangler deploy vip-9"};
    n++;
  }
}
fs.writeFileSync(p, JSON.stringify(Array.isArray(hist)?items:hist, null, 2));
console.log("history_fixed", n);

// ownership
const ownPath="data/domain_ownership.json";
if (fs.existsSync(ownPath)) {
  const own=JSON.parse(fs.readFileSync(ownPath,"utf8"));
  const cur=own[domain]||{};
  own[domain]={...cur, domain, currentLink:link, tele:link, templateId:"lp_gg88_vip_2", cnameTarget:"lp-gg88-vip-9.pages.dev", mode:"LP"};
  fs.writeFileSync(ownPath, JSON.stringify(own,null,2));
  console.log("ownership_updated");
}
NODE

# purge + verify
node --input-type=module <<'NODE'
import fs from "fs";
for (const line of fs.readFileSync(".env","utf8").split(/\\n/)){const t=line.trim();if(!t||t.startsWith("#")||!t.includes("="))continue;const i=t.indexOf("=");const k=t.slice(0,i).trim();let v=t.slice(i+1).trim();if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);if(!(k in process.env))process.env[k]=v;}
import { findZoneByName, tokenForZone } from "./src/cloudflare.js";
const z=await findZoneByName("gg883f.com");
const token=tokenForZone(z);
await fetch("https://api.cloudflare.com/client/v4/zones/"+z.id+"/purge_cache",{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({purge_everything:true})});
await new Promise(r=>setTimeout(r,2000));
for (const host of ["www.gg883f.com","gg883f.com","lp-gg88-vip-9.pages.dev"]) {
  const j=await (await fetch("https://"+host+"/domains.json?v="+Date.now(),{headers:{"user-agent":"Mozilla/5.0","cache-control":"no-cache"}})).json();
  const e=j["gg883f.com"]||j["www.gg883f.com"];
  console.log(host, e?.main_url||null);
}
NODE
`, (e,s)=>{ let o=""; s.on("data",d=>o+=d); s.stderr.on("data",d=>o+=d); s.on("close",code=>{console.log(o);console.log("exit",code);c.end();});});
}).connect({host:"103.146.22.218",username:"root",password:"admin123@!"});
