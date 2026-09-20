import { Client } from "ssh2";

const cmd = `
pm2 logs web-tenmienbet --lines 1500 --nostream 2>&1 | grep -iE 'gg88mt|deploy-302|BuyAndDeploy|removeDomainFromAll|Pages project' | tail -80
echo '=== active locks / worker? ==='
# check if node still has promise hanging - look at task age
python3 - <<'PY'
import json,time
from pathlib import Path
from datetime import datetime,timezone
j=json.loads(Path('/var/www/web-ten-mien/data/tasks.json').read_text(encoding='utf-8'))
items=j if isinstance(j,list) else j.get('tasks') or []
running=[t for t in items if t.get('status')=='RUNNING']
print('running_count',len(running))
for t in running:
  print(t.get('id'), t.get('domain'), t.get('type'), t.get('currentStep'), t.get('startedAt'))
PY
echo '=== uptime process ==='
pm2 describe web-tenmienbet 2>&1 | grep -E 'status|uptime|restarts|pid' | head -20
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
