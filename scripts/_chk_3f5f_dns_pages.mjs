import { Client } from "ssh2";
const c = new Client();
c.on("ready", () => {
  c.exec(`
python3 - <<'PY'
import json, urllib.request, ssl
ctx=ssl.create_default_context()
domains=['gg88my.com','gg88sgp.com','gg88usa.net','ggtong.me','ggquocte.net']
for d in domains:
  print('===', d)
  import subprocess
  for q in [f'dig +short {d} CNAME @1.1.1.1', f'dig +short www.{d} CNAME @1.1.1.1', f'dig +short {d} NS @1.1.1.1']:
    out=subprocess.check_output(q, shell=True, text=True).strip().replace('\\n',' | ')
    print(q.split()[2], '->', out or '(empty)')
PY

echo '--- pages custom domains 5f ---'
# use hub env for CF
cd /var/www/web-ten-mien
node --input-type=module -e '
import fs from "fs";
for (const line of fs.readFileSync(".env","utf8").split(/\\n/)){const t=line.trim();if(!t||t.startsWith("#")||!t.includes("="))continue;const i=t.indexOf("=");const k=t.slice(0,i).trim();const v=t.slice(i+1).trim();if(!(k in process.env))process.env[k]=v;}
const token=process.env.CLOUDFLARE_API_TOKEN;
const aid=process.env.CLOUDFLARE_ADMIN_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID;
const h={Authorization:"Bearer "+token,"Content-Type":"application/json"};
const domains=["gg88my.com","www.gg88my.com","gg88sgp.com","www.gg88sgp.com","gg88usa.net","www.gg88usa.net","ggtong.me","ggquocte.net"];
async function list(proj){
  const url=\`https://api.cloudflare.com/client/v4/accounts/\${aid}/pages/projects/\${proj}/domains\`;
  const r=await fetch(url,{headers:h});
  const j=await r.json();
  const names=(j.result||[]).map(x=>x.name+":"+x.status);
  console.log(proj, names.filter(n=>domains.some(d=>n.startsWith(d)||n.includes(d))).join(", ") || "(none of targets)");
  console.log("  total", (j.result||[]).length);
}
await list("landingpage-5f-g");
await list("ladpage-3f-nhannhan").catch(e=>console.log("3f pages", e.message));
'

echo '--- stuck tasks ---'
python3 - <<'PY'
import json
from pathlib import Path
for name in ['data/tasks.json','data/history.json']:
  p=Path('/var/www/web-ten-mien')/name
  if not p.exists():
    print(name,'missing'); continue
  data=json.loads(p.read_text())
  items=data if isinstance(data,list) else data.get('tasks') or data.get('items') or []
  hits=[x for x in items if 'gg88my' in str(x.get('domain','')).lower() or 'gg88my' in str(x)]
  print(name, 'hits', len(hits))
  for x in hits[:3]:
    print(' ', {k:x.get(k) for k in ['id','domain','status','actionType','templateId','progress','link','error','message'] if k in x or True})
PY
`, (e,s)=>{ let o=""; s.on("data",d=>o+=d); s.stderr.on("data",d=>o+=d); s.on("close",()=>{console.log(o);c.end();}); });
}).connect({host:"103.146.22.218",username:"root",password:"admin123@!"});
