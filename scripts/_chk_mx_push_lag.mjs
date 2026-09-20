import { Client } from "ssh2";
const c = new Client();
c.on("ready", () => {
  c.exec(`
cd /var/www/Landingpages/GG88/lp-gg88-mx
echo '=== git ==='
git status -sb
git log -5 --oneline
git log origin/master -3 --oneline
echo '=== local entries ==='
python3 - <<'PY'
import json
j=json.load(open('domains.json'))
for d in ['gg883.win','www.gg883.win','quocte.bio','www.quocte.bio','quocte88.us']:
  e=j.get(d)
  print(d, (e or {}).get('main_url') if isinstance(e,dict) else e)
PY
echo '=== ahead/behind ==='
git fetch origin 2>&1 | tail -3
git rev-list --left-right --count origin/master...HEAD
echo '=== live raw keys sample ==='
curl -sS -A 'Mozilla/5.0' 'https://lp-gg88-mx-git2.pages.dev/domains.json' | python3 -c 'import sys,json;j=json.load(sys.stdin); ks=[k for k in j if "gg883" in k or "quocte" in k]; print(ks); print({k:j[k] for k in ks})'
echo '=== live via custom ==='
curl -sS -A 'Mozilla/5.0' 'https://gg883.win/domains.json' | python3 -c 'import sys,json;j=json.load(sys.stdin); print("gg883" in str(j.keys()), [k for k in j if "gg883" in k])'
curl -sS -A 'Mozilla/5.0' 'https://quocte.bio/domains.json' | python3 -c 'import sys,json;j=json.load(sys.stdin); print("quocte.bio keys", [k for k in j if "quocte" in k])'
`, (e,s)=>{ let o=""; s.on("data",d=>o+=d); s.stderr.on("data",d=>o+=d); s.on("close",()=>{console.log(o);c.end();}); });
}).connect({host:"103.146.22.218",username:"root",password:"admin123@!"});
