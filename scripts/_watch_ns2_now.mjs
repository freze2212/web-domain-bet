import { Client } from "ssh2";

const cmd = `
export TZ=Asia/Ho_Chi_Minh
date
echo '=== ACTIVE ==='
curl -sS -m 5 https://tool.toolbcr79.com/api/get-active-table; echo
echo
echo '=== SESSION last 8 min key ==='
# UTC hours 09:3x-09:4x = 16:3x-16:4x VN
python3 - <<'PY'
from pathlib import Path
from datetime import datetime, timezone, timedelta
vn=timezone(timedelta(hours=7))
now=datetime.now(vn)
cut=now.timestamp()-8*60
lines=Path('/root/.pm2/logs/session-sexy-2-out.log').read_text(errors='replace').splitlines()
keys=('HALL FORWARD','HALL POLL','NOTIFY','CLICK TABLE','IN ROOM','AUTO ENTER','SHUTDOWN','Error in main','Frame was detached','BÀN CƯỢC','FORCE capture','PLACE BET')
fwd=0; det=0; recent=[]
for l in lines:
  if any(k in l for k in keys):
    recent.append(l)
  if 'HALL FORWARD' in l: fwd+=1
  if 'detached' in l: det+=1
print('--- last 35 key lines ---')
for l in recent[-35:]:
  print(l[-220:] if len(l)>220 else l)
print()
# count forward after last ENTER/NOTIFY
idx=0
for i,l in enumerate(lines):
  if 'ĐÃ VÀO THẲNG BÀN CƯỢC C03' in l or 'active_table=C03 → bot' in l:
    idx=i
chunk=lines[idx:]
cf=sum(1 for l in chunk if 'HALL FORWARD' in l)
cd=sum(1 for l in chunk if 'detached' in l)
print(f'AFTER_ENTER FORWARD={cf} DETACH={cd}')
print('LAST_FORWARD=', next((l for l in reversed(chunk) if 'HALL FORWARD' in l), 'NONE')[-120:])
print('LAST_DETACH=', next((l for l in reversed(chunk) if 'detached' in l), 'NONE')[-120:])
PY
echo
echo '=== BOT last 30 ==='
tail -n 30 /root/.pm2/logs/bot-sexy-2-out.log
echo
echo '=== PM2 ==='
pm2 jlist | python3 -c "import sys,json; d=json.load(sys.stdin);
for p in d:
  if p['name'] in ('session_sexy_2','bot_sexy_2','server_sexy'):
    pm=p['pm2_env'];
    print(p['name'], pm.get('status'), 'uptime_ms~', pm.get('pm_uptime'), 'restarts', pm.get('restart_time'))"
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
