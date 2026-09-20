import { Client } from "ssh2";

const cmd = `
python3 - <<'PY'
import json
from pathlib import Path
# recent failed buy for gg88hg
for p in [Path('/var/www/web-ten-mien/data/history.json'), Path('/var/www/web-ten-mien/data/tasks.json')]:
  if not p.exists():
    print('missing', p); continue
  j=json.loads(p.read_text(encoding='utf-8'))
  items=j if isinstance(j,list) else j.get('tasks') or j.get('history') or []
  print('===', p.name, 'len', len(items))
  hits=[x for x in items if 'gg88hg' in str(x.get('domain','')).lower() or 'gg88hg' in str(x)]
  for h in hits[-5:]:
    print(json.dumps({k:h.get(k) for k in ['id','domain','status','actionType','actionLabel','link','tele','templateId','templateName','error','params','isBuy'] if k in h or True}, ensure_ascii=False)[:500])
    print('keys', list(h)[:25])
    print('---')
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
