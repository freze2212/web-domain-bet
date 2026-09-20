import { Client } from "ssh2";

const cmd = `
export TZ=Asia/Ho_Chi_Minh
sleep 85
date
python3 - <<'PY'
from pathlib import Path
import json, urllib.request
lines=Path('/root/.pm2/logs/session-sexy-2-out.log').read_text(errors='replace').splitlines()
idx=0
for i,l in enumerate(lines):
  if 'lobby-only — hall ingest 24/7' in l: idx=i
c=lines[idx:]
print('FORWARD', sum(1 for l in c if 'HALL FORWARD' in l))
print('RESET', sum(1 for l in c if 'resetMain' in l or 'closeHard' in l))
print('BLOCK', sum(1 for l in c if 'block resetMain' in l))
print('FATAL_IGN', sum(1 for l in c if 'ignore FATAL UI' in l))
print('tail:')
for l in c[-10:]: print(l[-160:])
for t in ['C03','C05']:
  d=json.loads(urllib.request.urlopen(f'http://127.0.0.1:3201/predict/get-table-by-name?tableName={t}', timeout=5).read())
  x=d.get('table') or d
  r=(x.get('totalRound') or [{}])[-1]
  print(t, x.get('statusGame'), r.get('id'), r.get('stampTime'), r.get('roadRandom'), r.get('roadFormat'))
PY
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
