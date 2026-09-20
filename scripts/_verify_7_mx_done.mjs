import { Client } from "ssh2";
const c = new Client();
c.on("ready", () => {
  c.exec(`
ps -eo pid,cmd | awk '/[n]ode scripts\\/_switch_7/{print}' || echo DONE
echo '---JSON---'
cat /tmp/_switch_mx_7.json 2>/dev/null
echo '---LOG TAIL---'
tail -25 /tmp/_switch_mx_7.log
echo '=== VERIFY 7 ==='
python3 - <<'PY'
import json,urllib.request
from pathlib import Path
keep={
  "gg88h.uk":"https://www.gg8832.com/?id=894528974",
  "gg88k.uk":"https://www.gg8832.com/?id=851471280",
  "gg88top.win":"https://gg8817.com/?id=140366098",
  "gg88d.net":"https://gg8826.com/?id=769240761",
  "gg88t.net":"https://www.gg8824.com/?id=114851179",
  "gg88h.us":"https://www.gg8826.com/home/register?id=170291680",
  "gg88t.us":"https://gg8817.com/?id=720657617",
}
j=json.loads(Path('/var/www/Landingpages/GG88/lp-gg88-mx/domains.json').read_text())
print('mx_apex', sorted(k for k in j if not k.startswith('www.')))
for d,exp in keep.items():
  live=None; err=None
  try:
    req=urllib.request.Request('https://%s/domains.json'%d, method='GET')
    with urllib.request.urlopen(req, timeout=15) as r:
      dj=json.loads(r.read().decode())
      e=dj.get(d) or dj.get('www.'+d) or {}
      live=e.get('main_url')
  except Exception as ex:
    err=str(ex)[:80]
  hub= (j.get(d) or {}).get('main_url')
  print(d, 'hub', hub==exp, 'live', live==exp if live else err, 'link', live or hub)
PY
`, (e,s)=>{ let o=""; s.on("data",d=>o+=d); s.stderr.on("data",d=>o+=d); s.on("close",()=>{console.log(o);c.end();}); });
}).connect({host:"103.146.22.218",username:"root",password:"admin123@!"});
