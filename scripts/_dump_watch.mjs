import { Client } from "ssh2";

const cmd = `sed -n '49,105p' /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js | od -c | head -2
python3 - <<'PY'
from pathlib import Path
lines=Path('/var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js').read_text(encoding='utf-8').splitlines()
for i in range(73,102):
    print(f'{i+1}|{lines[i]}')
print('--- watchdog comment ---')
print(lines[1286])
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
