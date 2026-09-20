import { Client } from "ssh2";

const cmd = `
echo '=== LIVE server ==='
grep -n "ingest-hall-data\\|enqueueHallUpdate\\|Hall API empty\\|filterData" /var/www/tool-baccarat-v2-scratch-data/server.js | head -25
echo
echo '=== enqueue + route ==='
python3 - <<'PY'
from pathlib import Path
t=Path('/var/www/tool-baccarat-v2-scratch-data/server.js').read_text(encoding='utf-8', errors='ignore')
i=t.find('function enqueueHallUpdate')
print(t[i:i+700])
print('---ROUTE---')
j=t.find('ingest-hall-data')
print(t[j-80:j+700])
print('---EMPTY---')
k=t.find('empty tableItems')
print(t[k-200:k+300] if k>=0 else 'not in scratch server')
PY
echo
echo '=== same enqueue on bot-keo? ==='
diff -q /var/www/tool-baccarat-v2-scratch-data/server.js /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/server.js | head
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
