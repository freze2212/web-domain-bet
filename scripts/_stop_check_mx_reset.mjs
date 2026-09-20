import { Client } from "ssh2";
const c = new Client();
c.on("ready", () => {
  c.exec(`
# stop switch job NOW
for p in $(ps -eo pid,cmd | awk '/[n]ode scripts\\/_switch_7_to_mx_git2_vps\\.mjs/{print $1}'); do kill $p; echo killed:$p; done
sleep 1
ps -eo pid,cmd | awk '/[n]ode scripts\\/_switch_7/{print}' || echo STOPPED
echo '=== LOG TAIL ==='
tail -40 /tmp/_switch_mx_7.log
echo '=== MX domains.json count + our 7 ==='
cd /var/www/Landingpages/GG88/lp-gg88-mx
python3 - <<'PY'
import json
from pathlib import Path
p=Path('domains.json')
j=json.loads(p.read_text(encoding='utf-8')) if p.exists() else {}
keys=sorted(k for k in j if not str(k).startswith('www.'))
want=['gg88h.uk','gg88k.uk','gg88top.win','gg88d.net','gg88t.net','gg88h.us','gg88t.us']
print('total_apex', len(keys))
print('our7', {d:(j.get(d) or {}).get('main_url') for d in want})
print('git_status')
PY
git status -sb
git log -5 --oneline
echo '=== compare to origin ==='
git fetch origin 2>&1 | tail -3
git rev-list --left-right --count origin/master...HEAD 2>/dev/null || git rev-list --left-right --count origin/main...HEAD 2>/dev/null
`, (e,s)=>{
    let o=""; s.on("data",d=>o+=d); s.stderr.on("data",d=>o+=d); s.on("close",()=>{console.log(o);c.end();});
  });
}).connect({host:"103.146.22.218",username:"root",password:"admin123@!"});
