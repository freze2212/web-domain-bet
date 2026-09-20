import { Client } from "ssh2";

const cmd = `
export TZ=Asia/Ho_Chi_Minh
DOMAIN=gg88hg.com
date
echo '=== HISTORY / TASK ==='
python3 - <<'PY'
import json
from pathlib import Path
from datetime import datetime, timezone
d='gg88hg.com'
for p in [Path('/var/www/web-ten-mien/data/history.json'), Path('/var/www/web-ten-mien/data/tasks.json')]:
  j=json.loads(p.read_text(encoding='utf-8'))
  items=j if isinstance(j,list) else j.get('tasks') or []
  hits=[x for x in items if str(x.get('domain','')).lower().replace('www.','')==d]
  print(p.name, 'hits', len(hits))
  for h in hits[-3:]:
    keys=['id','status','actionType','actionLabel','link','tele','templateId','templateName','error','progress','cnameTarget','isBuy','taskId','timestamp','updatedAt','finishedAt','currentStep','type']
    print({k:h.get(k) for k in keys if h.get(k) is not None})
    if h.get('params'): print(' params', {k:h['params'].get(k) for k in h['params'] if k in ('domain','link','tele','templateId','isBuy','mode','historyId')})
    if h.get('steps'): print(' last_steps', h['steps'][-4:])
    print('---')
PY

echo '=== OWNER / REPO ==='
python3 - <<'PY'
import json,os
from pathlib import Path
own=json.loads(Path('/var/www/web-ten-mien/data/domain_ownership.json').read_text(encoding='utf-8'))
print('owner', own.get('gg88hg.com'))
hits=[]
for dirpath,_,files in os.walk('/var/www/Landingpages'):
  if 'domains.json' in files:
    p=os.path.join(dirpath,'domains.json')
    try: j=json.load(open(p,encoding='utf-8'))
    except: continue
    if 'gg88hg.com' in j or 'www.gg88hg.com' in j:
      hits.append((p, j.get('gg88hg.com') or j.get('www.gg88hg.com')))
print('repo hits', len(hits))
for p,e in hits[:5]: print(p, e)
PY

echo '=== DNS / LIVE ==='
dig +short NS gg88hg.com @1.1.1.1
dig +short gg88hg.com A @1.1.1.1
dig +short www.gg88hg.com CNAME @1.1.1.1
curl -sI --max-time 20 https://gg88hg.com/ 2>&1 | head -18
echo '--- domains.json ---'
curl -sS --max-time 12 https://gg88hg.com/domains.json 2>&1 | head -c 350; echo

echo '=== CF ZONE ==='
set -a; . /var/www/web-ten-mien/.env; set +a
for name in FREZE ADMIN; do
  if [ "$name" = FREZE ]; then T="$CLOUDFLARE_API_TOKEN"; else T="$CLOUDFLARE_ADMIN_API_TOKEN"; fi
  echo "== $name =="
  curl -sS "https://api.cloudflare.com/client/v4/zones?name=gg88hg.com" -H "Authorization: Bearer $T" | python3 -c 'import sys,json;j=json.load(sys.stdin);z=(j.get("result") or [None])[0]; print(z and {"id":z["id"],"status":z["status"],"ns":z.get("name_servers"),"account":(z.get("account") or {}).get("name")} or "NO_ZONE")'
done

echo '=== SPACESHIP ==='
cd /var/www/web-ten-mien
node --input-type=module <<'NODE'
import { getDomainInfo } from "./src/spaceship.js";
try {
  const info = await getDomainInfo("gg88hg.com");
  console.log(JSON.stringify({ns: info?.nameservers, status: info?.status, name: info?.name}, null, 0).slice(0,600));
} catch(e) { console.log('spaceship err', e.message); }
NODE
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
