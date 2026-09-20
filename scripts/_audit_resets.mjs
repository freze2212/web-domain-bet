import { Client } from "ssh2";

const cmd = `
FILE=/var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js
echo '=== resetMain / recover / watchdog ==='
grep -n "resetMain(\\|recoverFromFatalUi\\|startSessionExpiredWatcher\\|WATCHDOG\\|closeHard\\|force_reenter" "$FILE"
echo
echo '=== detectSessionExpired body head ==='
grep -n "async function detectSessionExpired\\|function startSessionExpiredWatcher\\|async function recoverFromFatalUi" "$FILE"
echo
sed -n '1725,1850p' "$FILE"
echo '======= recoverFromFatalUi ======='
grep -n "async function recoverFromFatalUi" "$FILE"
python3 - <<'PY'
from pathlib import Path
t=Path('/var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js').read_text(encoding='utf-8')
for name in ['async function recoverFromFatalUi','function startSessionExpiredWatcher']:
  i=t.find(name)
  print('FOUND' if i>=0 else 'MISS', name, i)
  if i>=0:
    print(t[i:i+1800])
    print('-----')
PY
echo
echo '=== live ==='
export TZ=Asia/Ho_Chi_Minh
date
python3 - <<'PY'
from pathlib import Path
lines=Path('/root/.pm2/logs/session-sexy-2-out.log').read_text(errors='replace').splitlines()
idx=0
for i,l in enumerate(lines):
  if 'lobby-only — hall ingest 24/7' in l: idx=i
c=lines[idx:]
print('FORWARD', sum(1 for l in c if 'HALL FORWARD' in l))
print('RESET', sum(1 for l in c if 'resetMain' in l or 'closeHard' in l))
print('KEEPALIVE extra', [l[-140:] for l in c if 'KEEPALIVE' in l and 'started' not in l][-8:])
print('last8:')
for l in c[-8:]: print(l[-160:])
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
