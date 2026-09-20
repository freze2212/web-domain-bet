import { Client } from "ssh2";

const cmd = `
export TZ=Asia/Ho_Chi_Minh
echo '=== HUB HISTORY BUY gg88dt + after ==='
python3 - <<'PY'
import json
from pathlib import Path
from datetime import datetime
h=json.loads(Path('/var/www/web-ten-mien/data/history.json').read_text(encoding='utf-8'))
buys=[]
for x in h:
  at=str(x.get('actionType') or '')
  ib=x.get('isBuy')
  if not (ib or at.startswith('BUY') or at=='BUY'): continue
  buys.append(x)
# find gg88dt
anchor=None
for x in buys:
  if str(x.get('domain','')).lower().replace('www.','')=='gg88dt.com':
    anchor=x.get('timestamp') or x.get('createdAt') or x.get('updatedAt')
    print('HUB_gg88dt', json.dumps({k:x.get(k) for k in ['id','domain','status','actionType','timestamp','updatedAt','finishedAt','error','link','templateName','isBuy']}, ensure_ascii=False))
if not anchor:
  print('HUB_gg88dt NOT_FOUND')
else:
  after=[]
  for x in buys:
    ts=x.get('timestamp') or x.get('createdAt') or ''
    if ts>=anchor:
      after.append(x)
  after.sort(key=lambda x: x.get('timestamp') or '')
  print('HUB_BUY_COUNT_FROM_gg88dt', len(after))
  for x in after:
    ts=x.get('timestamp') or ''
    print('\\t'.join([
      ts,
      str(x.get('status')),
      str(x.get('actionType')),
      str(x.get('domain')),
      ('ERR:'+str(x.get('error'))[:80]) if x.get('status')=='failed' else ''
    ]))
PY
echo '=== WHOIS gg88dt ==='
whois gg88dt.com 2>/dev/null | grep -iE 'Creation Date|Registrar:|Name Server' | head -15
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
