import { Client } from "ssh2";

const cmd = `
cd /var/www/web-ten-mien
set -a; . ./.env; set +a
node --input-type=module <<'NODE'
import { getDomainInfo } from "./src/spaceship.js";
const info = await getDomainInfo("gg88mt.com");
console.log("spaceship ns:", info?.nameservers || info?.nameServers || JSON.stringify(info).slice(0,500));
NODE

python3 - <<'PY'
import json
from pathlib import Path
for p,key in [('tasks.json','tasks'),('history.json',None)]:
  j=json.loads(Path('/var/www/web-ten-mien/data/'+p).read_text(encoding='utf-8'))
  items=j if isinstance(j,list) else j.get(key) or j.get('tasks') or []
  for x in items:
    if 'gg88mt' in str(x.get('domain','')).lower() or x.get('id') in ('task_1789305542143_8sxjd','hist_1789305542142_bzubi'):
      print(p, {k:x.get(k) for k in ['id','status','progress','currentStep','error','link','finishedAt'] if x.get(k) is not None})
PY

echo '=== dig again ==='
dig +short NS gg88mt.com @1.1.1.1
dig +short NS gg88mt.com @8.8.8.8
curl -sI --max-time 15 https://gg88mt.com/ 2>&1 | head -15
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
