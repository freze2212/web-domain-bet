import { Client } from "ssh2";

const cmd = `
export TZ=Asia/Ho_Chi_Minh
echo '=== TASK DETAIL ==='
python3 - <<'PY'
import json
from pathlib import Path
tid='task_1789305542143_8sxjd'
j=json.loads(Path('/var/www/web-ten-mien/data/tasks.json').read_text(encoding='utf-8'))
items=j if isinstance(j,list) else j.get('tasks') or []
t=next((x for x in items if x.get('id')==tid), None)
print(json.dumps(t, ensure_ascii=False, indent=2)[:4000] if t else 'missing')
PY

echo '=== PM2 LOGS gg88mt ==='
pm2 logs web-tenmienbet --lines 300 --nostream 2>&1 | grep -i 'gg88mt' | tail -40

echo '=== CF find zone (admin+freze) ==='
cd /var/www/web-ten-mien
node - <<'NODE'
require('dotenv').config();
const tokens=[
  ['FREZE', process.env.CLOUDFLARE_API_TOKEN],
  ['ADMIN', process.env.CLOUDFLARE_ADMIN_API_TOKEN],
].filter(([,t])=>t);
(async()=>{
  for(const [name,token] of tokens){
    const r=await fetch('https://api.cloudflare.com/client/v4/zones?name=gg88mt.com',{headers:{Authorization:'Bearer '+token}});
    const j=await r.json();
    const z=(j.result||[])[0];
    console.log(name, 'ok', j.success, z?{id:z.id,status:z.status,ns:z.name_servers,account:z.account?.name}: 'NO_ZONE', j.errors||[]);
  }
})().catch(e=>console.error(e));
NODE

echo '=== SPACESHIP NS? ==='
# check if domain still on spaceship NS only
whois gg88mt.com 2>/dev/null | head -40 || true
dig +short NS gg88mt.com @8.8.8.8
dig +short NS gg88mt.com @1.1.1.1
`;

const c = new Client();
c.on("ready", () => {
  c.exec(cmd, (e, s) => {
    let o = "";
    s.on("data", (d) => (o += d.toString()));
    s.stderr.on("data", (d) => (o += d.toString()));
    s.on("close", () => {
      console.log(o || "(empty)");
      c.end();
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
