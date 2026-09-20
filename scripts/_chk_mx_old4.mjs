import { Client } from "ssh2";
const c = new Client();
c.on("ready", () => {
  c.exec(`cd /var/www/Landingpages/GG88/lp-gg88-mx; python3 - <<'PY'
import json,subprocess
j=json.load(open('domains.json'))
old=json.loads(subprocess.check_output(['git','show','81ffa5e:domains.json'], text=True))
for d in ['gg888y.com','gg88a.xyz','gg88hq.com','gg88mx.com']:
  def link(e):
    if isinstance(e,str): return e
    if isinstance(e,dict): return e.get('main_url')
    return e
  o,n=link(old.get(d)),link(j.get(d))
  print(d, 'SAME' if o==n else 'CHANGED', n)
PY
# confirm target7 only in recent mx commits
git log --oneline 81ffa5e..HEAD
`, (e,s)=>{ let o=""; s.on("data",d=>o+=d); s.stderr.on("data",d=>o+=d); s.on("close",()=>{console.log(o);c.end();}); });
}).connect({host:"103.146.22.218",username:"root",password:"admin123@!"});
