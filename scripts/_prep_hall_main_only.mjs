import { Client } from "ssh2";

const cmd = `
FILE=/var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js
# current HALL_ONLY + poll + heartbeat + watchdog snippets
python3 - <<'PY'
from pathlib import Path
lines=Path('/var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js').read_text(encoding='utf-8',errors='replace').splitlines()
for key in ['function isHallOnlyMode','HALL_ONLY:','async function pollHallFromBrowserAndIngest','function startActiveTableHeartbeat','lastHallIngestAt','WATCHDOG','recoverHallViaLiveLobby','shouldReset']:
  for i,l in enumerate(lines):
    if key in l:
      print(f'FOUND {key} @{i+1}')
      break
  else:
    print('MISS', key)
print('--- HALL_ONLY block ---')
for i,l in enumerate(lines):
  if 'HALL_ONLY:' in l or 'isHallOnlyMode()' in l and 'if (' in l:
    for j in range(i, min(i+45,len(lines))):
      print(f'{j+1}:{lines[j]}')
    print('---')
    if 'isHallOnlyMode()' in l and 'if (' in l: break
print('--- watchdog ---')
for i,l in enumerate(lines):
  if 'WATCHDOG' in l or 'không có tiến triển' in l:
    for j in range(max(0,i-5), min(len(lines),i+25)):
      print(f'{j+1}:{lines[j]}')
    print('---')
PY
echo '=== bot pm2 ==='
pm2 jlist | python3 -c "import sys,json;d=json.load(sys.stdin);print([(p['name'],p['pm2_env']['status']) for p in d])"
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
