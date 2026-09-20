import { Client } from "ssh2";
const c = new Client();
c.on("ready", () => {
  c.exec(`
cd /var/www/Landingpages/GG88/3f-thanhnhan
git status -sb
git log -3 --oneline
git show HEAD:domains.json 2>/dev/null | python3 -c 'import sys,json;j=json.load(sys.stdin); print("HEAD apex", sorted(k for k in j if not k.startswith("www."))); print("gg88my", j.get("gg88my.com"))'
echo '--- origin ---'
git fetch origin 2>&1 | tail -2
git show origin/main:domains.json 2>/dev/null | python3 -c 'import sys,json;j=json.load(sys.stdin); print("origin apex", sorted(k for k in j if not k.startswith("www."))); print("gg88my", j.get("gg88my.com"))' || echo no_origin_main

cd /var/www/web-ten-mien
python3 - <<'PY'
import json
from pathlib import Path
h=json.loads(Path('data/history.json').read_text())
hits=[x for x in h if str(x.get('domain','')).lower().replace('www.','')=='gg88my.com']
hits=sorted(hits,key=lambda x:x.get('timestamp') or '', reverse=True)
print('hist', len(hits))
for x in hits[:5]:
  print(x.get('timestamp'), x.get('status'), x.get('actionType'), x.get('link'), x.get('templateId'))
PY

dig +short gg88my.com A @1.1.1.1
dig +short www.gg88my.com CNAME @1.1.1.1
dig +short gg88my.com CNAME @1.1.1.1
`, (e,s)=>{ let o=""; s.on("data",d=>o+=d); s.stderr.on("data",d=>o+=d); s.on("close",()=>{console.log(o);c.end();}); });
}).connect({host:"103.146.22.218",username:"root",password:"admin123@!"});
