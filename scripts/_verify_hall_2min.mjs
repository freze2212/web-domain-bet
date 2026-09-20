import { Client } from "ssh2";

const cmd = `
export TZ=Asia/Ho_Chi_Minh
sleep 120
date
python3 - <<'PY'
from pathlib import Path
lines=Path('/root/.pm2/logs/session-sexy-2-out.log').read_text(errors='replace').splitlines()
idx=0
for i,l in enumerate(lines):
  if 'HALL KEEPALIVE] started' in l: idx=i
chunk=lines[idx:]
f=sum(1 for l in chunk if 'HALL FORWARD' in l)
d=sum(1 for l in chunk if 'detached' in l)
e=sum(1 for l in chunk if 'AUTO ENTER' in l or 'CLICK TABLE' in l)
k=sum(1 for l in chunk if 'HALL KEEPALIVE' in l and 'started' not in l)
p=sum(1 for l in chunk if 'HALL POLL LOBBY' in l)
print(f'FORWARD={f} DETACH={d} ENTER={e} KEEPALIVE_EVENTS={k} POLL_LOGS={p}')
print('LAST5 FORWARD:')
for l in [x for x in chunk if 'HALL FORWARD' in x][-5:]:
  print(l)
print('LAST keepalive/poll:')
for l in [x for x in chunk if 'KEEPALIVE' in x or 'POLL LOBBY' in x][-8:]:
  print(l)
PY
curl -sS -m 8 'https://tool.toolbcr79.com/predict/get-table-by-name?tableName=C03' | python3 -c "
import sys,json
d=json.loads(sys.stdin.read()); t=d.get('table') or d
r=(t.get('totalRound') or [])[-1]
print('C03', r.get('id'), r.get('stampTime'), r.get('win'))
"
curl -sS -m 5 https://tool.toolbcr79.com/api/get-active-table; echo
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
