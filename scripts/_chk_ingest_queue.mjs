import { Client } from "ssh2";

const cmd = `
echo '=== enqueueHallUpdate ==='
grep -n "function enqueueHallUpdate\\|function checkAndUpdate\\|ingest-hall-data\\|Hall API empty\\|URI_REQUEST" /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/server.js | head -30
echo
echo '=== enqueue body ==='
python3 - <<'PY'
from pathlib import Path
t=Path('/var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/server.js').read_text(encoding='utf-8', errors='ignore')
for key in ['async function enqueueHallUpdate','function enqueueHallUpdate','app.post("/api/ingest-hall-data"','app.post(\\'/api/ingest-hall-data\\'']:
    i=t.find(key)
    print('KEY', key, i)
i=t.find('enqueueHallUpdate')
print('--- first enqueue def ---')
# find function
import re
m=re.search(r'(async )?function enqueueHallUpdate[\\s\\S]{0,1800}', t)
print(m.group(0)[:1800] if m else 'no')
print('--- ingest route ---')
m=re.search(r'ingest-hall-data[\\s\\S]{0,800}', t)
print(m.group(0)[:800] if m else 'no')
print('--- empty tableItems ---')
m=re.search(r'Hall API empty[\\s\\S]{0,400}', t)
print(m.group(0)[:400] if m else 'no')
PY
echo
echo '=== NS1 last 30 ==='
tail -n 30 /root/.pm2/logs/session-sexy-1-out.log
echo
echo '=== NS1 err last 8 ==='
tail -n 8 /root/.pm2/logs/session-sexy-1-error.log
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
