import { Client } from "ssh2";

const cmd = `
export TZ=Asia/Ho_Chi_Minh
echo 'wait 95s login...'
sleep 95
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
      out[t]=(x.get('statusGame'), r.get('id'), r.get('stampTime'), r.get('roadRandom'), r.get('roadFormat'))
    except Exception as e:
      out[t]=str(e)
  return out

def chunk():
  lines=Path('/root/.pm2/logs/session-sexy-2-out.log').read_text(errors='replace').splitlines()
  idx=0
  for i,l in enumerate(lines):
    if 'lobby-only — hall ingest 24/7' in l: idx=i
  return lines[idx:]

c=chunk()
print('BOOT', next((l for l in c if 'lobby-only' in l), 'NOT_IN_LOBBY_YET'))
print('FORWARD', sum(1 for l in c if 'HALL FORWARD' in l))
print('RESET', sum(1 for l in c if 'resetMain' in l or 'WATCHDOG' in l or 'closeHard' in l))
print('POLL', [l[-160:] for l in c if 'POLL LOBBY' in l or 'KEEPALIVE' in l][-6:])
print('STAMPS1', stamps())
print('--- wait 150s (qua cửa sổ watchdog 120s cũ) ---')
time.sleep(150)
c=chunk()
print('FORWARD2', sum(1 for l in c if 'HALL FORWARD' in l))
print('RESET2', sum(1 for l in c if 'resetMain' in l or 'WATCHDOG' in l or 'closeHard' in l))
print('STAMPS2', stamps())
print('tail:')
for l in c[-15:]:
  print(l[-180:])
PY
echo
tail -n 6 /root/.pm2/logs/session-sexy-2-error.log
pm2 show session_sexy_2 | grep -E 'status|uptime|restarts'
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
