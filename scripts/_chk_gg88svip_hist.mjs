import { Client } from "ssh2";

const cmd = `
python3 - <<'PY'
import json
from pathlib import Path
p = Path('/var/www/web-ten-mien/data/history.json')
data = json.loads(p.read_text(encoding='utf-8'))
items = data if isinstance(data, list) else data.get('items') or data.get('history') or []
rows = [x for x in items if str(x.get('domain','')).lower()=='gg88svip.co']
print('count', len(rows))
for x in rows:
    keys = ['id','timestamp','status','actionType','actionLabel','domain','templateName','templateId','cnameTarget','link','error','progress','username','liveStatus','liveLink']
    print({k:x.get(k) for k in keys if k in x or True})
    print('---')
PY
`;

const c = new Client();
c.on("ready", () => {
  c.exec(cmd, (e, st) => {
    let o = "";
    st.on("data", (d) => (o += d));
    st.stderr.on("data", (d) => (o += d));
    st.on("close", () => {
      console.log(o.slice(0, 6000));
      c.end();
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
