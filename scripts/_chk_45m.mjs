import { Client } from "ssh2";

const cmd = `
export TZ=Asia/Ho_Chi_Minh
date
echo '=== pm2 ==='
pm2 show session_sexy_2 | grep -E 'status|uptime|restarts|unstable'
echo
python3 - <<'PY'
from pathlib import Path
from datetime import datetime, timezone, timedelta
import json, urllib.request
vn=timezone(timedelta(hours=7))
lines=Path('/root/.pm2/logs/session-sexy-2-out.log').read_text(errors='replace').splitlines()
# last lobby boot
idx=0
boots=[]
for i,l in enumerate(lines):
  if 'lobby-only — hall ingest 24/7' in l:
    idx=i
    boots.append(i)
c=lines[idx:]
print('lobby_boots_in_log', len(boots))
print('FORWARD_since_last_boot', sum(1 for l in c if 'HALL FORWARD' in l))
print('RESET_since_last_boot', sum(1 for l in c if 'resetMain' in l or 'closeHard' in l))
print('WATCHDOG', sum(1 for l in c if 'WATCHDOG' in l))
print('block_reset', sum(1 for l in c if 'block resetMain' in l))
print('keepalive_hard', sum(1 for l in c if 'hard resetMain' in l))
print('keepalive_soft', sum(1 for l in c if 'soft recover' in l))
print('logout', sum(1 for l in c if 'Auto Logout' in l))
print('POLL fail', sum(1 for l in c if 'HALL POLL LOBBY' in l))
# dated lines after boot
dated=[l for l in c if '2026-09-13 17:' in l or '2026-09-13 18:' in l]
print('first_dated', dated[0][:70] if dated else None)
print('last_dated', dated[-1][:70] if dated else None)
print('last12:')
for l in c[-12:]:
  print(l[-170:])

print('=== tables ===')
for t in ['C01','C03','C05']:
  try:
    d=json.loads(urllib.request.urlopen(f'http://127.0.0.1:3201/predict/get-table-by-name?tableName={t}', timeout=5).read())
    x=d.get('table') or d
    r=(x.get('totalRound') or [{}])[-1]
    ts=r.get('stampTime')
    tm=datetime.fromtimestamp(ts/1000, vn).strftime('%H:%M:%S') if ts else '-'
    print(t, x.get('statusGame'), 'id', r.get('id'), tm, 'pred', r.get('roadRandom'), 'res', r.get('roadFormat'))
  except Exception as e:
    print(t, e)
PY
echo
echo '=== err since choke ==='
grep -E 'WATCHDOG|FATAL|AUTO-RECOVER' /root/.pm2/logs/session-sexy-2-error.log | tail -8
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
