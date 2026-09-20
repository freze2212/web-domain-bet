import { Client } from "ssh2";

const cmd = `
export TZ=Asia/Ho_Chi_Minh
sleep 80
date
echo '=== active ==='
curl -sS -m 5 https://tool.toolbcr79.com/api/get-active-table; echo
echo
echo '=== since track boot (latest) ==='
# take from last "track=C03"
tac /root/.pm2/logs/session-sexy-2-out.log | awk '/stay lobby — track=/{print; exit} {print}' | tac | grep -E 'HALL ONLY|NOTIFY|FORWARD|POLL|detach|ENTER|CLICK TABLE' | tail -40
echo
echo '=== counts after last track ==='
python3 - <<'PY'
from pathlib import Path
lines=Path('/root/.pm2/logs/session-sexy-2-out.log').read_text(errors='replace').splitlines()
idx=0
for i,l in enumerate(lines):
  if 'stay lobby — track=' in l: idx=i
chunk=lines[idx:]
from collections import Counter
c=Counter()
for l in chunk:
  if 'HALL FORWARD' in l: c['FORWARD']+=1
  if 'HALL POLL LOBBY' in l: c['POLL']+=1
  if 'detach' in l: c['DETACH']+=1
  if 'API NOTIFY' in l: c['NOTIFY']+=1
print(dict(c))
print('sample poll:')
for l in chunk:
  if 'HALL POLL' in l: print(l[-200:])
PY
echo
echo '=== bot after notify ==='
grep -E 'WARM|HÔ|WAIT|predict|DỰ|C03|BLOCK' /root/.pm2/logs/bot-sexy-2-out.log | tail -25
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
