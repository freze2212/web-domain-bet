import { Client } from "ssh2";

const py = `
import json
from pathlib import Path
p = Path('/var/www/web-ten-mien/data/history.json')
data = json.loads(p.read_text(encoding='utf-8'))
items = data if isinstance(data, list) else data.get('items') or data.get('history') or []
rows = [x for x in items if 'tong88vip.com' in str(x.get('domain','')).lower()]
rows = sorted(rows, key=lambda x: x.get('timestamp') or '', reverse=True)
print('hist_count', len(rows))
for x in rows[:5]:
    keys = ['timestamp','status','actionType','actionLabel','templateName','templateId','cnameTarget','link','error','liveStatus','progress']
    print({k: x.get(k) for k in keys})
    print('---')
`;

const c = new Client();
c.on("ready", () => {
  c.sftp((err, sftp) => {
    const ws = sftp.createWriteStream("/tmp/_tong88_hist.py");
    ws.on("close", () => {
      c.exec("python3 /tmp/_tong88_hist.py; rm -f /tmp/_tong88_hist.py", (e2, st) => {
        let o = "";
        st.on("data", (d) => (o += d));
        st.stderr.on("data", (d) => (o += d));
        st.on("close", () => {
          console.log(o);
          c.end();
        });
      });
    });
    ws.end(Buffer.from(py, "utf8"));
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
