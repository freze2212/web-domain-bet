import { Client } from "ssh2";

const cmd = `
FILE=/var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js
python3 - <<'PY'
from pathlib import Path
lines=Path('/var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js').read_text(encoding='utf-8',errors='replace').splitlines()
# notify + prefer C03 + clearActive
for i,l in enumerate(lines):
  if any(k in l for k in ['notifyActiveTableToServer','clearActiveTableOnServer','ưu tiên','preferred','requestedTargetTable','C03','URI_REQUEST_DATA','lastSessionRequestBase']):
    if i<100 or 'function notify' in l or 'async function notify' in l or 'async function clear' in l or 'C03' in l or 'requestedTarget' in l:
      print(f'{i+1}:{l[:160]}')
print('--- notify fn ---')
for i,l in enumerate(lines):
  if 'async function notifyActiveTableToServer' in l or 'function notifyActiveTableToServer' in l:
    for j in range(i, min(i+80,len(lines))):
      print(f'{j+1}:{lines[j]}')
    break
print('--- prefer table ---')
for i,l in enumerate(lines):
  if 'C03' in l and ('NS2' in l or 'prefer' in l.lower() or 'ưu tiên' in l or 'target' in l.lower()):
    a=max(0,i-3); b=min(len(lines),i+8)
    for j in range(a,b): print(f'{j+1}:{lines[j]}')
    print('---')
PY
# bot wait bàn
grep -n "chưa vào bàn\\|activeTable\\|get-active-table\\|WAIT BÀN" /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main -r --include='*.js' 2>/dev/null | head -40
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
