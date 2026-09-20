import { Client } from "ssh2";
const c = new Client();
c.on("ready", () => {
  c.exec(`python3 - <<'PY'
import json
from pathlib import Path
tasks=json.loads(Path('/var/www/web-ten-mien/data/tasks.json').read_text())
items=tasks if isinstance(tasks,list) else []
print('tasks_running', sum(1 for t in items if t.get('status') in ('RUNNING','PENDING')))
print('tasks_failed_stale', sum(1 for t in items if 'treo quá lâu' in str(t.get('error') or '')))
h=json.loads(Path('/var/www/web-ten-mien/data/history.json').read_text())
print('hist_in_progress', sum(1 for x in h if x.get('status') in ('in_progress','pending')))
print('hist_cancelled', sum(1 for x in h if x.get('status')=='cancelled'))
print('hist_stale_failed', sum(1 for x in h if x.get('details',{}).get('closedAs')=='stale_in_progress'))
PY
grep -n 'tasksQueueFilter\\|reconcileStaleTasks\\|Đang chạy' /var/www/web-ten-mien/public/app.js /var/www/web-ten-mien/public/index.html | head -20
`, (e,s)=>{ let o=""; s.on("data",d=>o+=d); s.stderr.on("data",d=>o+=d); s.on("close",()=>{console.log(o);c.end();}); });
}).connect({host:"103.146.22.218",username:"root",password:"admin123@!"});
