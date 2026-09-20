import { Client } from "ssh2";

const cmd = `
export TZ=Asia/Ho_Chi_Minh
echo '===== NOW ====='
date; free -h; uptime
echo
echo '===== OOM around Sep 13 ====='
dmesg -T 2>/dev/null | grep -iE 'oom|Out of memory|Killed process' | tail -30
journalctl -k --since '2026-09-12 00:00' --until '2026-09-13 15:00' --no-pager 2>/dev/null | grep -iE 'oom|Out of memory|Killed process' | tail -30

echo
echo '===== PM2 memory restart / kill around session_sexy_2 ====='
grep -E 'session_sexy_2|server_sexy|mem|restart|exited|SIGKILL|SIGTERM|SIGINT' /root/.pm2/pm2.log | grep -E '2026-09-13|2026-09-12T1[89]|2026-09-13T0[67]' | tail -80

echo
echo '===== session_sexy_2 max_memory / monit ====='
pm2 show session_sexy_2 2>/dev/null | grep -iE 'status|uptime|restart|memory|script|created|unstable|exec'
pm2 show server_sexy 2>/dev/null | grep -iE 'status|uptime|restart|memory|max memory'

echo
echo '===== Firefox / session crash signatures ====='
echo '--- session-sexy-2-error (crash/oom/kill) ---'
grep -iE 'oom|out of memory|SIGKILL|SIGTERM|killed|crash|FATAL|SESSION_EXPIRED|BLACK_SCREEN|Target closed|browser has been closed|Protocol error|Page crashed|detached' /root/.pm2/logs/session-sexy-2-error.log 2>/dev/null | tail -50
echo '--- session-sexy-2-out around first mass detach today ---'
# find first detach on Sep 13 morning VN (~00:xx) and around 13:50
grep -n '2026-09-13T' /root/.pm2/logs/session-sexy-2-out.log | head -3
grep 'Frame was detached' /root/.pm2/logs/session-sexy-2-out.log | grep '2026-09-13T0[0-9]' | head -5
grep 'Frame was detached' /root/.pm2/logs/session-sexy-2-out.log | grep '2026-09-13T06:5' | head -10

echo
echo '===== What happened JUST BEFORE detach storm on Sep13 06:57 UTC / 13:57 ICT ====='
# show 40 lines before 06:57:32
python3 - <<'PY'
from pathlib import Path
p=Path('/root/.pm2/logs/session-sexy-2-out.log')
lines=p.read_text(errors='replace').splitlines()
keys=['2026-09-13T06:55','2026-09-13T06:56','2026-09-13T06:57','2026-09-13T06:58','2026-09-13T06:59']
idxs=[]
for i,l in enumerate(lines):
  if any(k in l for k in keys):
    idxs.append(i)
if not idxs:
  print('no lines'); raise SystemExit
start=max(0, idxs[0]-30)
end=min(len(lines), idxs[0]+80)
print(f'window lines {start}-{end} (anchor {idxs[0]})')
for l in lines[start:end]:
  print(l)
PY

echo
echo '===== AUTO-LOGOUT vs detach correlation (server err) ====='
grep -E '2026-09-13 13:5[5-9]|2026-09-13 14:0[0-5]' /root/.pm2/logs/server-sexy-error-0.log | grep -iE 'AUTO-LOGOUT|expire|error|fail|hall' | head -20
grep -c 'Hall API AUTO-LOGOUT' /root/.pm2/logs/server-sexy-error-0.log
# rate: count per minute around 13:50-14:10
python3 - <<'PY'
from collections import Counter
from pathlib import Path
c=Counter()
for l in Path('/root/.pm2/logs/server-sexy-error-0.log').read_text(errors='replace').splitlines():
  if 'Hall API AUTO-LOGOUT' in l and l.startswith('2026-09-13 13:'):
    c[l[:16]] += 1
  if 'Hall API AUTO-LOGOUT' in l and l.startswith('2026-09-13 14:0'):
    c[l[:16]] += 1
for k in sorted(c)[:30]:
  print(k, c[k])
PY

echo
echo '===== current RSS of session stack ====='
ps -o pid,rss,pmem,etime,cmd -p $(pgrep -f 'session.js' | tr '\\n' ',' | sed 's/,$//') 2>/dev/null
ps -o pid,rss,pmem,etime,cmd -C firefox --sort=-rss 2>/dev/null | head -10
echo 'sum firefox RSS KB:' $(ps -C firefox -o rss= 2>/dev/null | awk '{s+=$1} END{print s+0}')
echo 'sum node tool RSS KB:' $(ps -eo rss=,cmd | awk '/tool-baccarat|session.js|server.js/ && !/awk/{s+=$1} END{print s+0}')

echo
echo '===== tipslot / other memory hogs ====='
ps aux --sort=-%mem | head -12
`;

const c = new Client();
c.on("ready", () => {
  c.exec(cmd, { pty: true }, (e, s) => {
    let o = "";
    s.on("data", (d) => (o += d.toString()));
    s.stderr.on("data", (d) => (o += d.toString()));
    s.on("close", () => {
      console.log(o || "(empty)");
      c.end();
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
