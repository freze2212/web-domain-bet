import { Client } from "ssh2";

const cmd = `
FILE=/var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js
echo '=== pollHall / IN-TABLE / FORWARD refs ==='
rg -n "HALL POLL IN-TABLE|HALL FORWARD|pollHall|in-table|IN.TABLE|active_table|iframeGameHall|frame.evaluate|detach" "$FILE" | head -80
echo
echo '=== maybe pollHallFromBrowserAndIngest ==='
rg -n "function pollHallFromBrowserAndIngest|async function pollHall|HALL POLL IN-TABLE|HALL FORWARD" "$FILE"
echo
# show function bodies around key lines
python3 - <<'PY'
from pathlib import Path
p=Path('/var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js')
text=p.read_text(encoding='utf-8',errors='replace')
lines=text.splitlines()
keys=['HALL POLL IN-TABLE','HALL FORWARD','pollHallFromBrowserAndIngest','startActiveTableHeartbeat']
for k in keys:
  for i,l in enumerate(lines):
    if k in l:
      print(f'--- {k} @ {i+1} ---')
      a=max(0,i-5); b=min(len(lines),i+40)
      for j in range(a,b):
        print(f'{j+1}:{lines[j]}')
      print()
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
