import { Client } from "ssh2";

const cmd = `
export TZ=Asia/Ho_Chi_Minh
DOMAIN=gg88mt.com
date
echo '=== HISTORY ==='
python3 - <<'PY'
import json
from pathlib import Path
d='gg88mt.com'
for p in [Path('/var/www/web-ten-mien/data/history.json'), Path('/var/www/web-ten-mien/data/tasks.json')]:
  j=json.loads(p.read_text(encoding='utf-8'))
  items=j if isinstance(j,list) else j.get('tasks') or []
  hits=[x for x in items if str(x.get('domain','')).lower().replace('www.','')==d]
  print(p.name, 'hits', len(hits))
  for h in hits[-3:]:
    keys=['id','status','actionType','actionLabel','link','tele','templateId','templateName','error','progress','liveStatus','lastCheckError','cnameTarget','isBuy','taskId','timestamp','updatedAt','finishedAt','currentStep']
    print({k:h.get(k) for k in keys if h.get(k) is not None})
    if h.get('params'): print(' params', h.get('params'))
    print('---')
PY

echo '=== OWNERSHIP / DOMAINS LIST ==='
python3 - <<'PY'
import json,os
from pathlib import Path
# ownership
own=json.loads(Path('/var/www/web-ten-mien/data/domain_ownership.json').read_text(encoding='utf-8'))
print('owner', own.get('gg88mt.com'))
# scan domains.json
hits=[]
root='/var/www/Landingpages'
for dirpath,_,files in os.walk(root):
  if 'domains.json' in files:
    p=os.path.join(dirpath,'domains.json')
    try:
      j=json.load(open(p,encoding='utf-8'))
    except: continue
    if 'gg88mt.com' in j or 'www.gg88mt.com' in j:
      hits.append((p, j.get('gg88mt.com') or j.get('www.gg88mt.com')))
print('repo hits', len(hits))
for p,e in hits[:8]:
  print(p, e)
PY

echo '=== DNS / LIVE ==='
dig +short NS gg88mt.com
dig +short gg88mt.com A
dig +short www.gg88mt.com A
dig +short gg88mt.com CNAME
echo '--- curl ---'
curl -sI --max-time 20 https://gg88mt.com/ 2>&1 | head -20
echo '--- domains.json live ---'
curl -sS --max-time 15 https://gg88mt.com/domains.json 2>&1 | head -c 400
echo
echo '--- www ---'
curl -sI --max-time 15 https://www.gg88mt.com/ 2>&1 | head -12

echo '=== CF ZONE CACHE ==='
python3 - <<'PY'
import json
from pathlib import Path
zs=json.loads(Path('/var/www/web-ten-mien/data/cf_zones_cache.json').read_text(encoding='utf-8'))
hits=[z for z in zs if str(z.get('name','')).lower().replace('www.','')=='gg88mt.com']
for z in hits:
  print({k:z.get(k) for k in ['name','id','status','accountName','accountId']})
PY
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
