import { Client } from "ssh2";

const cmd = `
export TZ=Asia/Ho_Chi_Minh
echo 'wait 85s for lobby...'
sleep 85
date
echo
echo '=== active (should be null) ==='
curl -sS -m 5 https://tool.toolbcr79.com/api/get-active-table; echo
echo
echo '=== since lobby-only ==='
python3 - <<'PY'
from pathlib import Path
lines=Path('/root/.pm2/logs/session-sexy-2-out.log').read_text(errors='replace').splitlines()
idx=0
for i,l in enumerate(lines):
  if 'lobby-only — hall ingest 24/7' in l or 'HALL KEEPALIVE] started' in l:
    idx=i
chunk=lines[idx:]
print('BOOT_LINE', chunk[0] if chunk else 'NONE')
from collections import Counter
c=Counter()
for l in chunk:
  if 'HALL FORWARD' in l: c['FORWARD']+=1
  if 'HALL POLL LOBBY' in l: c['POLL']+=1
  if 'HALL KEEPALIVE' in l: c['KEEP']+=1
  if 'AUTO ENTER' in l or 'CLICK TABLE' in l: c['ENTER']+=1
  if 'PLACE BET' in l or 'FORCE capture' in l: c['TIPSTER']+=1
  if 'detached' in l: c['DETACH']+=1
  if 'skip place' in l or 'skip capture' in l: c['SKIP']+=1
print(dict(c))
print('--- last 25 key ---')
keys=('FORWARD','POLL','KEEPALIVE','HALL ONLY','ENTER','CLICK','PLACE','capture','detach','Error','iframe')
for l in chunk:
  if any(k.lower() in l.lower() for k in keys):
    last=l
# print last matching
out=[l for l in chunk if any(k.lower() in l.lower() for k in ('forward','poll','keepalive','hall only','enter','click table','place','detach','error in main','iframe'))]
for l in out[-25:]:
  print(l[-200:])
PY
echo
echo '=== bot gone? ==='
pm2 jlist | python3 -c "import sys,json;d=json.load(sys.stdin);print([p['name'] for p in d])"
echo
# sample C03 stamp movement via hall
curl -sS -m 8 'https://tool.toolbcr79.com/predict/get-table-by-name?tableName=C03' | python3 -c "
import sys,json
d=json.loads(sys.stdin.read())
t=d.get('table') or d.get('data') or d
rounds=(t.get('totalRound') or []) if isinstance(t,dict) else []
if rounds:
  r=rounds[-1]
  print('C03 last', {k:r.get(k) for k in r if k in ('id','stampTime','winner','resultWinner','score') or 'win' in k.lower() or 'stamp' in k.lower()})
  print('n', len(rounds))
else:
  print('no rounds', str(d)[:200])
"
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
