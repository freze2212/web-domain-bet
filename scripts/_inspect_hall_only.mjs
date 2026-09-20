import { Client } from "ssh2";

const cmd = `
FILE=/var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js
python3 - <<'PY'
from pathlib import Path
p=Path('/var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js')
lines=p.read_text(encoding='utf-8',errors='replace').splitlines()
keys=[
 'AUTO ENTER TABLE','ENTER TABLE','currentInTable','startActiveTableHeartbeat',
 'pollHallFromBrowserAndIngest','ingestHallTableItems','HALL FORWARD',
 'ưu tiên C03','resetMain','nameService','HALL_ONLY','SKIP_ENTER'
]
for k in keys:
  hits=[i+1 for i,l in enumerate(lines) if k.lower() in l.lower()]
  print(f'{k}: {hits[:25]}' + (' ...' if len(hits)>25 else ''))

print('\\n=== AUTO ENTER vicinity ===')
for i,l in enumerate(lines):
  if 'AUTO ENTER TABLE' in l or 'autoEnter' in l or 'enterTable' in l.lower():
    if 'AUTO ENTER' in l or 'function' in l and 'enter' in l.lower():
      a=max(0,i-3); b=min(len(lines),i+25)
      print(f'--- @{i+1} ---')
      for j in range(a,b): print(f'{j+1}:{lines[j]}')
      print()

# find call sites of startActiveTableHeartbeat and enter flow after hall
print('=== startActiveTableHeartbeat calls ===')
for i,l in enumerate(lines):
  if 'startActiveTableHeartbeat' in l:
    print(f'{i+1}:{l.strip()}')

print('\\n=== currentInTable assignments ===')
for i,l in enumerate(lines):
  if 'currentInTable' in l and ('=' in l):
    print(f'{i+1}:{l.strip()}')
PY
wc -l $FILE
ls -la /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js*
# env for session
pm2 show session_sexy_2 | sed -n '1,80p'
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
