import { Client } from "ssh2";

const cmd = `
export TZ=Asia/Ho_Chi_Minh
date
echo '=== session now ==='
pm2 show session_sexy_2 | grep -E 'status|uptime|restarts'
python3 - <<'PY'
from pathlib import Path
import json, urllib.request
from datetime import datetime, timezone, timedelta
vn=timezone(timedelta(hours=7))
lines=Path('/root/.pm2/logs/session-sexy-2-out.log').read_text(errors='replace').splitlines()
idx=0
for i,l in enumerate(lines):
  if 'lobby-only — hall ingest 24/7' in l: idx=i
c=lines[idx:]
print('FORWARD', sum(1 for l in c if 'HALL FORWARD' in l))
print('RESET', sum(1 for l in c if 'resetMain' in l or 'closeHard' in l))
print('KEEP', [l[-140:] for l in c if 'KEEPALIVE' in l][-8:])
print('tail:')
for l in c[-8:]: print(l[-160:])
print('tables:')
for t in ['C01','C03','C05']:
  d=json.loads(urllib.request.urlopen('http://127.0.0.1:3201/predict/get-table-by-name?tableName='+t, timeout=5).read())
  x=d.get('table') or d
  r=(x.get('totalRound') or [{}])[-1]
  ts=r.get('stampTime')
  tm=datetime.fromtimestamp(ts/1000, vn).strftime('%H:%M:%S') if ts else '-'
  print(t, x.get('statusGame'), r.get('id'), tm)
PY
echo
echo '=== keepalive lock / lastHallFreshAt ==='
grep -n "hallKeepaliveRunning\\|lastHallFreshAt\\|HALL_ONLY" /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/run-ns2.sh
ls /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/*.sh
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
