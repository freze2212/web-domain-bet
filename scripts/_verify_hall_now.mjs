import { Client } from "ssh2";

const cmd = `
export TZ=Asia/Ho_Chi_Minh
sleep 80
date
python3 - <<'PY'
from pathlib import Path
import json, urllib.request, time

def stamps():
  out={}
  for t in ['C01','C03','C05']:
    try:
      d=json.loads(urllib.request.urlopen(f'http://127.0.0.1:3201/predict/get-table-by-name?tableName={t}', timeout=5).read())
      x=d.get('table') or d
      r=(x.get('totalRound') or [{}])[-1]
      out[t]=(x.get('statusGame'), r.get('id'), r.get('stampTime'))
    except Exception as e:
      out[t]=str(e)
  return out

lines=Path('/root/.pm2/logs/session-sexy-2-out.log').read_text(errors='replace').splitlines()
idx=0
for i,l in enumerate(lines):
  if 'lobby-only — hall ingest 24/7' in l: idx=i
c=lines[idx:]
print('in_lobby', any('lobby-only' in l for l in c[-30:]) or 'lobby-only' in (c[0] if c else ''))
print('FORWARD', sum(1 for l in c if 'HALL FORWARD' in l))
print('RESET', sum(1 for l in c if 'resetMain' in l or 'closeHard' in l))
print('PLAY_FAIL', sum(1 for l in c if 'KHÔNG THỰC HIỆN' in l))
print('LOGOUT', sum(1 for l in c if 'Auto Logout' in l))
print('STAMPS1', stamps())
print('last lines:')
for l in c[-12:]:
  print(l[-180:])
print('--- 35s ---')
time.sleep(35)
lines=Path('/root/.pm2/logs/session-sexy-2-out.log').read_text(errors='replace').splitlines()
idx=0
for i,l in enumerate(lines):
  if 'lobby-only — hall ingest 24/7' in l: idx=i
c=lines[idx:]
print('FORWARD2', sum(1 for l in c if 'HALL FORWARD' in l))
print('RESET2', sum(1 for l in c if 'resetMain' in l or 'closeHard' in l))
print('STAMPS2', stamps())
for l in c[-8:]:
  print(l[-160:])
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
