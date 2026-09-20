import { Client } from "ssh2";
const c = new Client();
c.on("ready", () => {
  c.exec(`python3 - <<'PY'
import json
from pathlib import Path
from datetime import datetime, timezone
tasks=json.loads(Path('/var/www/web-ten-mien/data/tasks.json').read_text())
items=tasks if isinstance(tasks,list) else tasks.get('tasks') or []
running=[t for t in items if t.get('status') in ('RUNNING','PENDING')]
print('tasks_running', len(running))
for t in running[:15]:
  print(t.get('id'), t.get('domain'), t.get('status'), t.get('currentStep'), t.get('startedAt'), t.get('updatedAt') or t.get('createdAt'))
h=json.loads(Path('/var/www/web-ten-mien/data/history.json').read_text())
ip=[x for x in h if x.get('status') in ('in_progress','pending')]
print('history_in_progress', len(ip))
for x in ip[:15]:
  print(x.get('id'), x.get('domain'), x.get('actionType'), (x.get('progress') or '')[:60], x.get('timestamp'), x.get('taskId'))
PY`, (e,s)=>{ let o=""; s.on("data",d=>o+=d); s.stderr.on("data",d=>o+=d); s.on("close",()=>{console.log(o);c.end();}); });
}).connect({host:"103.146.22.218",username:"root",password:"admin123@!"});
