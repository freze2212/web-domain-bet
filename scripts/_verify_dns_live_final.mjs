import { Client } from "ssh2";
const c = new Client();
c.on("ready", () => {
  const cmd = `
cd /var/www/web-ten-mien
node --input-type=module -e '
import fs from "fs";
for (const line of fs.readFileSync(".env","utf8").split(/\\n/)){
  const t=line.trim(); if(!t||t.startsWith("#")||!t.includes("=")) continue;
  const i=t.indexOf("="); const k=t.slice(0,i).trim(); const v=t.slice(i+1).trim();
  if(!(k in process.env)) process.env[k]=v;
}
import { findZoneByName, tokenForZone } from "./src/cloudflare.js";
const domains=["gg88my.com","gg88sgp.com","gg88usa.net","ggtong.me","ggquocte.net"];
for (const d of domains) {
  const zone = await findZoneByName(d);
  if (!zone) { console.log(d, "NO_ZONE"); continue; }
  const token = tokenForZone(zone);
  const url = "https://api.cloudflare.com/client/v4/zones/"+zone.id+"/dns_records?per_page=100";
  const j = await (await fetch(url,{headers:{Authorization:"Bearer "+token}})).json();
  if (!j.success) { console.log(d, "ERR", JSON.stringify(j.errors)); continue; }
  const rows=(j.result||[]).filter(x=>["A","AAAA","CNAME"].includes(x.type)&&(x.name===d||x.name==="www."+d));
  console.log(d, "->", rows.map(x=>x.type+":"+x.name+"="+x.content).join(" | ") || "(no apex/www A/CNAME)");
}
const own=JSON.parse(fs.readFileSync("data/ownership.json","utf8"));
const map=own.domains||own;
console.log("own.gg88my", JSON.stringify(map["gg88my.com"]||null));
'
echo LIVE_CHECK
for d in gg88my.com gg88sgp.com gg88usa.net ggtong.me ggquocte.net; do
  code=$(curl -sS -o /tmp/_lp.html -w "%{http_code}" --max-time 15 "https://$d/")
  link=$(python3 - <<PY
import json,urllib.request
d="$d"
try:
  j=json.load(urllib.request.urlopen("https://%s/domains.json?v=1"%d, timeout=15))
  e=j.get(d) or j.get("www."+d) or {}
  print(e.get("main_url") or "-")
except Exception as e:
  print("err:"+str(e))
PY
)
  echo "$d HTTP=$code link=$link"
done
`;
  c.exec(cmd, (e,s)=>{ let o=""; s.on("data",d=>o+=d); s.stderr.on("data",d=>o+=d); s.on("close",()=>{console.log(o);c.end();}); });
}).connect({host:"103.146.22.218",username:"root",password:"admin123@!"});
