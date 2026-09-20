import { Client } from "ssh2";

const cmd = `
BASE=/var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main
echo '===== paths ====='
ls -la $BASE/servicePuppeteer/session.js
wc -l $BASE/servicePuppeteer/session.js
echo
grep -n 'HALL POLL\\|HALL FORWARD\\|startHallPollingLoop\\|Frame was detached\\|lastHall\\|WATCHDOG\\|resetMain\\|lastSessionProgress' $BASE/servicePuppeteer/session.js | head -80
echo
echo '===== extract poll loop ====='
python3 - <<'PY'
from pathlib import Path
p=Path('/var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js')
lines=p.read_text(errors='replace').splitlines()
for i,l in enumerate(lines):
  if 'HALL POLL' in l or 'startHallPollingLoop' in l or 'Frame was detached' in l:
    print(f'{i+1}:{l[:160]}')
print('total', len(lines))
# print function containing HALL POLL
for i,l in enumerate(lines):
  if 'HALL POLL IN-TABLE' in l:
    start=max(0,i-40); end=min(len(lines), i+25)
    print('--- context ---')
    for j in range(start,end):
      print(f'{j+1}:{lines[j]}')
    break
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
