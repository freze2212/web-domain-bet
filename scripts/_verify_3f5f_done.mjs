import { Client } from "ssh2";
const c = new Client();
c.on("ready", () => {
  c.exec(`
set -e
echo '=== 5f git ==='
cd /var/www/Landingpages/GG88/landing-page-5f
git status -sb
git log -5 --oneline
python3 - <<'PY'
import json
j=json.load(open('domains.json'))
for d in ['gg88my.com','gg88sgp.com','gg88usa.net','ggtong.me','ggquocte.net']:
  print(d, j.get(d) or j.get('www.'+d))
PY
echo '--- remote ---'
git fetch origin 2>&1 | tail -3
BR=$(git rev-parse --abbrev-ref HEAD)
echo branch=$BR
git show origin/$BR:domains.json 2>/dev/null | python3 -c 'import sys,json;j=json.load(sys.stdin); print("remote gg88my", j.get("gg88my.com")); print("remote has sgp/usa", "gg88sgp.com" in j, "gg88usa.net" in j)'

echo '=== 3f still empty? ==='
python3 -c 'import json;j=json.load(open("/var/www/Landingpages/GG88/3f-thanhnhan/domains.json")); print(sorted(k for k in j if not k.startswith("www.")))'

echo '=== DNS via hub findZone + list records raw ==='
cd /var/www/web-ten-mien
node --input-type=module <<'NODE'
import fs from "fs";
for (const line of fs.readFileSync(".env","utf8").split(/\\n/)){
  const t=line.trim(); if(!t||t.startsWith("#")||!t.includes("=")) continue;
  const i=t.indexOf("="); const k=t.slice(0,i).trim(); const v=t.slice(i+1).trim();
  if(!(k in process.env)) process.env[k]=v;
}
import { findZoneByName, tokenForZone } from "./src/cloudflare.js";

async function dump(d) {
  const zone = await findZoneByName(d);
  if (!zone) { console.log(d, "NO_ZONE"); return; }
  const token = tokenForZone(zone);
  const url = \`https://api.cloudflare.com/client/v4/zones/\${zone.id}/dns_records?per_page=100\`;
  const r = await fetch(url, { headers: { Authorization: "Bearer "+token }});
  const j = await r.json();
  if (!j.success) { console.log(d, "DNS_ERR", j.errors); return; }
  const rows = (j.result||[]).filter(x => ["A","AAAA","CNAME"].includes(x.type) && (x.name===d || x.name==="www."+d || x.name.endsWith("."+d)));
  console.log(d, "acct", zone.account?.id, "n=", rows.length);
  for (const x of rows) console.log(" ", x.type, x.name, "->", x.content, "proxied="+x.proxied);
}
for (const d of ["gg88my.com","gg88sgp.com","gg88usa.net","ggtong.me","ggquocte.net"]) await dump(d);

# ownership
const own = JSON.parse(fs.readFileSync("data/ownership.json","utf8"));
const o = own.domains?.["gg88my.com"] || own["gg88my.com"] || null;
console.log("ownership gg88my", JSON.stringify(o));
NODE

echo '=== live domains.json has entry? ==='
for d in gg88my.com gg88sgp.com gg88usa.net; do
  curl -sS "https://$d/domains.json?v=$(date +%s)" | python3 -c "import sys,json;d='$d';j=json.load(sys.stdin); e=j.get(d) or j.get('www.'+d); print(d, e)"
done
`, (e,s)=>{ let o=""; s.on("data",d=>o+=d); s.stderr.on("data",d=>o+=d); s.on("close",()=>{console.log(o);c.end();}); });
}).connect({host:"103.146.22.218",username:"root",password:"admin123@!"});
