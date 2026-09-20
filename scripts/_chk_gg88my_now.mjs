import { Client } from "ssh2";
const c = new Client();
c.on("ready", () => {
  c.exec(`
python3 - <<'PY'
import json
from pathlib import Path
for p in ['/var/www/Landingpages/GG88/3f-thanhnhan/domains.json','/var/www/Landingpages/GG88/landing-page-5f/domains.json']:
  j=json.loads(Path(p).read_text())
  print('==', p)
  for d in ['gg88my.com','www.gg88my.com','gg88sgp.com','gg88usa.net','ggtong.me','ggquocte.net']:
    print(d, j.get(d))
  print('apex', sorted(k for k in j if not k.startswith('www.')))
PY
dig +short CNAME gg88my.com @1.1.1.1
dig +short www.gg88my.com CNAME @1.1.1.1
curl -sI -A 'Mozilla/5.0' --max-time 15 https://gg88my.com/ | head -8
curl -sS -A 'Mozilla/5.0' --max-time 15 https://gg88my.com/domains.json | head -c 400; echo
`, (e,s)=>{ let o=""; s.on("data",d=>o+=d); s.stderr.on("data",d=>o+=d); s.on("close",()=>{console.log(o);c.end();}); });
}).connect({host:"103.146.22.218",username:"root",password:"admin123@!"});
