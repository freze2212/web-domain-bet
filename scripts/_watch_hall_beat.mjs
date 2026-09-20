import { Client } from "ssh2";

const cmd = `
export TZ=Asia/Ho_Chi_Minh
date
echo
echo '=== ACTIVE ==='
curl -sS -m 5 https://tool.toolbcr79.com/api/get-active-table; echo
echo
echo '=== SESSION last 40 lines ==='
tail -n 40 /root/.pm2/logs/session-sexy-2-out.log
echo
echo '=== FORWARD timing (last 25) ==='
python3 - <<'PY'
from pathlib import Path
from datetime import datetime, timezone, timedelta
vn=timezone(timedelta(hours=7))
lines=Path('/root/.pm2/logs/session-sexy-2-out.log').read_text(errors='replace').splitlines()
# find last lobby boot
idx=0
for i,l in enumerate(lines):
  if 'lobby-only — hall ingest 24/7' in l: idx=i
chunk=lines[idx:]
fw=[(i,l) for i,l in enumerate(chunk) if 'HALL FORWARD' in l]
print('FORWARD_COUNT_SINCE_BOOT', len(fw))
print('KEEPALIVE', sum(1 for l in chunk if 'HALL KEEPALIVE' in l))
print('RESET', sum(1 for l in chunk if 'resetMain' in l or 'WATCHDOG' in l or 'closeHard' in l))
print('POLL_FAIL', sum(1 for l in chunk if 'HALL POLL LOBBY' in l))
print('ENTER', sum(1 for l in chunk if 'AUTO ENTER' in l or 'CLICK TABLE' in l))
# pm2 log lines often lack timestamp for FORWARD — use file mtime? instead sample with nearby dated lines
# Show last 15 FORWARD with surrounding dated context
print('--- last 15 FORWARD (with prev dated line if any) ---')
for i,l in fw[-15:]:
  prev=''
  for j in range(i, max(-1,i-8), -1):
    if '2026-09-13' in chunk[j] or 'T09:' in chunk[j] or 'T10:' in chunk[j]:
      prev=chunk[j][:60]
      break
  print(prev, '|', l[-80:])
print('last line of log:', chunk[-1][-120:] if chunk else None)
print('log age: check pm2 uptime below')
PY
echo
echo '=== PM2 session ==='
pm2 show session_sexy_2 | grep -E 'status|uptime|restarts|pid'
echo
echo '=== tables NOW vs +25s ==='
for t in C01 C03 C05; do
  curl -sS -m 5 "http://127.0.0.1:3201/predict/get-table-by-name?tableName=$t" | python3 -c "import sys,json;d=json.loads(sys.stdin.read());x=d.get('table')or d;r=(x.get('totalRound')or[{}])[-1];print('$t', x.get('statusGame'), 'id', r.get('id'), 'stamp', r.get('stampTime'), 'n', len(x.get('totalRound')or[]))"
done
echo '... sleep 25s ...'
sleep 25
date
for t in C01 C03 C05; do
  curl -sS -m 5 "http://127.0.0.1:3201/predict/get-table-by-name?tableName=$t" | python3 -c "import sys,json;d=json.loads(sys.stdin.read());x=d.get('table')or d;r=(x.get('totalRound')or[{}])[-1];print('$t', x.get('statusGame'), 'id', r.get('id'), 'stamp', r.get('stampTime'), 'n', len(x.get('totalRound')or[]))"
done
echo
echo '=== FORWARD after wait (new lines?) ==='
tail -n 15 /root/.pm2/logs/session-sexy-2-out.log
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
