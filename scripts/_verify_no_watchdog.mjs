import { Client } from "ssh2";

const cmd = `
export TZ=Asia/Ho_Chi_Minh
echo 'wait 200s (> watchdog 147s)...'
sleep 200
date
python3 - <<'PY'
from pathlib import Path
lines=Path('/root/.pm2/logs/session-sexy-2-out.log').read_text(errors='replace').splitlines()
# last lobby-only boot
idx=0
for i,l in enumerate(lines):
  if 'lobby-only — hall ingest 24/7' in l: idx=i
chunk=lines[idx:]
f=sum(1 for l in chunk if 'HALL FORWARD' in l)
w=sum(1 for l in chunk if 'WATCHDOG' in l or 'closeHard (resetMain)' in l)
e=sum(1 for l in chunk if 'AUTO ENTER' in l or 'CLICK TABLE' in l)
k=sum(1 for l in chunk if 'HALL KEEPALIVE' in l)
print(f'since_boot FORWARD={f} RESET={w} ENTER={e} KEEPALIVE_LINES={k}')
print('first:', chunk[0] if chunk else None)
print('has later reset?', any('closeHard (resetMain)' in l for l in chunk[5:]))
print('last 8 key:')
for l in chunk:
  if any(x in l for x in ('FORWARD','KEEPALIVE','WATCHDOG','resetMain','HALL ONLY','Error in main','AUTO ENTER')):
    pass
ks=[l for l in chunk if any(x in l for x in ('FORWARD','KEEPALIVE','WATCHDOG','resetMain','lobby-only','Error in main','AUTO ENTER','CLICK TABLE'))]
for l in ks[-12:]:
  print(l[-180:])
PY
echo
curl -sS -m 5 https://tool.toolbcr79.com/api/get-active-table; echo
curl -sS -m 5 'http://127.0.0.1:3201/predict/get-table-by-name?tableName=C01' | python3 -c "import sys,json;d=json.loads(sys.stdin.read());t=d.get('table')or d;r=(t.get('totalRound')or[-1])[-1];print('C01',t.get('statusGame'),'id',r.get('id'),'stamp',r.get('stampTime'))"
curl -sS -m 5 'http://127.0.0.1:3201/predict/get-table-by-name?tableName=C03' | python3 -c "import sys,json;d=json.loads(sys.stdin.read());t=d.get('table')or d;r=(t.get('totalRound')or[-1])[-1];print('C03',t.get('statusGame'),'id',r.get('id'),'stamp',r.get('stampTime'))"
pm2 jlist | python3 -c "import sys,json;d=json.load(sys.stdin);print('pm2',[p['name'] for p in d])"
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
