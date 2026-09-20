import { Client } from "ssh2";
const c = new Client();
c.on("ready", () => {
  c.exec(`
export TZ=Asia/Ho_Chi_Minh
cd /var/www/web-ten-mien
python3 - <<'PY'
import json
from pathlib import Path
from datetime import datetime, timezone, timedelta

want={'gg88h.uk','gg88k.uk','gg88top.win','gg88d.net','gg88t.net','gg88h.us','gg88t.us'}
mx_before={'gg888y.com','gg88a.xyz','gg88hq.com','gg88mx.com'}

# 1) history SWITCH_TPL to mx since today
h=json.loads(Path('data/history.json').read_text(encoding='utf-8'))
cut='2026-09-14T05:00:00'
sw=[]
for x in h:
  if x.get('actionType')!='SWITCH_TPL': continue
  ts=x.get('timestamp') or x.get('updatedAt') or ''
  if ts < cut: continue
  tid=x.get('templateId') or ''
  cname=str(x.get('cnameTarget') or '')
  if tid=='lp_gg88_mx' or 'mx-git2' in cname or 'mx' in str(x.get('templateName') or '').lower():
    sw.append((ts, x.get('domain'), x.get('status'), x.get('link')))
print('=== SWITCH_TPL -> MX since 05:00Z ===')
print('count', len(sw))
other=[s for s in sw if str(s[1] or '').lower().replace('www.','') not in want]
print('OUTSIDE target7', len(other))
for s in other[:20]: print(' OTHER', s)
for s in sw:
  d=str(s[1] or '').lower().replace('www.','')
  if d in want: print(' OK', s[1], s[2])

# 2) mx domains.json
j=json.loads(Path('/var/www/Landingpages/GG88/lp-gg88-mx/domains.json').read_text(encoding='utf-8'))
apex=sorted(k for k in j if not str(k).startswith('www.'))
print('=== MX apex now', len(apex), '===')
print(apex)
missing_old=sorted(mx_before - set(apex))
print('missing_old_4', missing_old)
extra=sorted(set(apex) - mx_before - want)
print('extra_unexpected', extra)

# 3) check old 4 links unchanged vs commit 81ffa5e if possible
import subprocess
raw=subprocess.check_output(['git','-C','/var/www/Landingpages/GG88/lp-gg88-mx','show','81ffa5e:domains.json'], text=True)
old=json.loads(raw)
print('=== old4 link compare ===')
for d in sorted(mx_before):
  o=(old.get(d) or {}).get('main_url')
  n=(j.get(d) or {}).get('main_url')
  print(d, 'SAME' if o==n else 'CHANGED', 'old=',o, 'now=',n)
PY

echo '=== CNAME sample target7 vs old4 ==='
for d in gg88h.uk gg88t.us gg888y.com gg88mx.com gg88hq.com gg88a.xyz; do
  echo -n "$d -> "
  dig +short CNAME www.$d @1.1.1.1 | head -1
  dig +short $d CNAME @1.1.1.1 | head -1
  dig +short $d A @1.1.1.1 | head -2 | tr '\\n' ' '
  echo
done
`, (e,s)=>{ let o=""; s.on("data",d=>o+=d); s.stderr.on("data",d=>o+=d); s.on("close",()=>{console.log(o);c.end();}); });
}).connect({host:"103.146.22.218",username:"root",password:"admin123@!"});
