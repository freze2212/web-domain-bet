import { Client } from "ssh2";

const cmd = `
export TZ=Asia/Ho_Chi_Minh
echo '===== OOM on Sep 13 specifically? ====='
dmesg -T 2>/dev/null | grep -i 'Sep 13' | grep -iE 'oom|Killed' || echo 'no Sep13 in dmesg -T grep'
journalctl -k --since '2026-09-13 00:00' --until '2026-09-13 15:00' --no-pager 2>/dev/null | grep -iE 'oom|Out of memory|Killed process' || echo 'NO kernel OOM on Sep 13'

echo
echo '===== SESSION_EXPIRED timeline ====='
grep -nE 'SESSION_EXPIRED|BLACK_SCREEN|FATAL UI|browser has been closed|Target closed|Page crashed|AUTO-LOGOUT|login|relogin' /root/.pm2/logs/session-sexy-2-error.log | tail -40
grep -nE 'SESSION_EXPIRED|BLACK_SCREEN|FATAL|relogin|login success|INTO TABLE|IN-TABLE OK' /root/.pm2/logs/session-sexy-2-out.log | tail -40

echo
echo '===== Context 40 lines BEFORE first 13:57 detach ====='
python3 - <<'PY'
from pathlib import Path
lines=Path('/root/.pm2/logs/session-sexy-2-out.log').read_text(errors='replace').splitlines()
anchor=None
for i,l in enumerate(lines):
  if '2026-09-13T06:57:32' in l and 'Frame was detached' in l:
    anchor=i; break
print('anchor', anchor)
if anchor is None:
  # fallback any 06:57 detach
  for i,l in enumerate(lines):
    if '2026-09-13T06:57' in l and 'detached' in l:
      anchor=i; break
  print('fallback anchor', anchor)
if anchor is not None:
  for l in lines[max(0,anchor-50):anchor+5]:
    print(l)
PY

echo
echo '===== Was hall already AUTO-LOGOUT all morning? ====='
python3 - <<'PY'
from collections import Counter
from pathlib import Path
c=Counter()
for l in Path('/root/.pm2/logs/server-sexy-error-0.log').read_text(errors='replace').splitlines():
  if 'Hall API AUTO-LOGOUT' in l and l.startswith('2026-09-13 '):
    hour=l[11:13]
    c[hour]+=1
for h in sorted(c):
  print(f'hour {h}: {c[h]} AUTO-LOGOUT lines')
PY

echo
echo '===== detach count by hour Sep13 ====='
python3 - <<'PY'
from collections import Counter
from pathlib import Path
c=Counter()
for l in Path('/root/.pm2/logs/session-sexy-2-out.log').read_text(errors='replace').splitlines():
  if 'Frame was detached' in l and '2026-09-13T' in l:
    # 2026-09-13T06:57:32
    h=l.split('2026-09-13T',1)[1][:2]
    c[h]+=1
for h in sorted(c):
  # UTC hour -> ICT +7
  ict=(int(h)+7)%24
  print(f'UTC {h} (=ICT {ict:02d}): {c[h]} detach')
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
