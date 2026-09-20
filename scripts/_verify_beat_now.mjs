import { Client } from "ssh2";

const cmd = `
export TZ=Asia/Ho_Chi_Minh
echo 'wait 90s boot...'
sleep 90
date
python3 - <<'PY'
from pathlib import Path
import time, urllib.request, json

def stamps():
  out={}
  for t in ['C01','C03','C05']:
    try:
      d=json.loads(urllib.request.urlopen(f'http://127.0.0.1:3201/predict/get-table-by-name?tableName={t}', timeout=5).read())
      x=d.get('table')or d
      r=(x.get('totalRound')or[{}])[-1]
      out[t]=(x.get('statusGame'), r.get('id'), r.get('stampTime'))
    except Exception as e:
      out[t]=str(e)
  return out

lines=Path('/root/.pm2/logs/session-sexy-2-out.log').read_text(errors='replace').splitlines()
idx=0
for i,l in enumerate(lines):
  if 'lobby-only — hall ingest 24/7' in l: idx=i
chunk=lines[idx:]
fw=sum(1 for l in chunk if 'HALL FORWARD' in l)
poll=[l for l in chunk if 'POLL LOBBY' in l or 'KEEPALIVE' in l]
print('BOOT', chunk[0] if chunk else None)
print('FORWARD_SINCE_BOOT', fw)
print('RESET', sum(1 for l in chunk if 'resetMain' in l or 'WATCHDOG' in l))
print('POLL/KEEP last:', poll[-6:])
print('STAMPS1', stamps())
print('--- wait 30s for beat ---')
time.sleep(30)
lines=Path('/root/.pm2/logs/session-sexy-2-out.log').read_text(errors='replace').splitlines()
idx=0
for i,l in enumerate(lines):
  if 'lobby-only — hall ingest 24/7' in l: idx=i
chunk=lines[idx:]
fw2=sum(1 for l in chunk if 'HALL FORWARD' in l)
print('FORWARD_AFTER_30s', fw2, 'delta', fw2-fw)
print('STAMPS2', stamps())
print('tail:')
for l in chunk[-12:]:
  print(l[-180:])
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
