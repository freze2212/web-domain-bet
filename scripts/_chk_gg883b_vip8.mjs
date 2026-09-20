import { Client } from "ssh2";
const c = new Client();
c.on("ready", () => {
  c.exec(`
echo '=== find vip-8 folder ==='
find /var/www/Landingpages -maxdepth 3 -type d -iname '*vip*8*' 2>/dev/null
find /var/www/Landingpages -maxdepth 3 -type d -iname '*4d*' 2>/dev/null | head
ls /var/www/Landingpages/GG88 | head -40

echo '=== git remotes near vip ==='
for d in /var/www/Landingpages/GG88/ldpape_4d /var/www/Landingpages/GG88/lp-gg88-vip-8 /var/www/Landingpages/GG88/ldpape_4d-vip8; do
  if [ -d "$d/.git" ]; then
    echo "-- $d"
    git -C "$d" remote -v | head -2
    git -C "$d" log -1 --oneline
    python3 -c "import json;j=json.load(open('$d/domains.json')); print('gg883b', j.get('gg883b.com')); print('count', len([k for k in j if not k.startswith('www.')]))" 2>/dev/null
  fi
done

# pages project domains for vip-8
cd /var/www/web-ten-mien
node --input-type=module -e '
import fs from "fs";
for (const line of fs.readFileSync(".env","utf8").split(/\\n/)){const t=line.trim();if(!t||t.startsWith("#")||!t.includes("="))continue;const i=t.indexOf("=");const k=t.slice(0,i).trim();const v=t.slice(i+1).trim();if(!(k in process.env))process.env[k]=v;}
const token=process.env.CLOUDFLARE_API_TOKEN;
const aid=process.env.CLOUDFLARE_ADMIN_ACCOUNT_ID||process.env.CLOUDFLARE_ACCOUNT_ID;
async function dump(proj){
  const url="https://api.cloudflare.com/client/v4/accounts/"+aid+"/pages/projects/"+proj;
  const j=await (await fetch(url,{headers:{Authorization:"Bearer "+token}})).json();
  const p=j.result||{};
  console.log(proj, "src=", p.source?.type, p.source?.config?.owner+"/"+p.source?.config?.repo_name, "prod=", p.canonical_deployment?.url || p.subdomain);
  const d=await (await fetch("https://api.cloudflare.com/client/v4/accounts/"+aid+"/pages/projects/"+proj+"/domains",{headers:{Authorization:"Bearer "+token}})).json();
  const hit=(d.result||[]).filter(x=>String(x.name).includes("gg883b"));
  console.log("  custom domains total", (d.result||[]).length, "gg883b", hit);
}
await dump("lp-gg88-vip-8");
await dump("lp-gg88-vip-2");
'
`, (e,s)=>{ let o=""; s.on("data",d=>o+=d); s.stderr.on("data",d=>o+=d); s.on("close",()=>{console.log(o);c.end();});});
}).connect({host:"103.146.22.218",username:"root",password:"admin123@!"});
