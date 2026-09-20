import { Client } from "ssh2";
const c = new Client();
c.on("ready", () => {
  c.exec(`
cd /var/www/Landingpages/GG88/lp-gg88-mx
set -a; . /var/www/web-ten-mien/.env; set +a
git push origin master 2>&1
echo EXIT:$?
git status -sb
echo '=== wait deploy ==='
sleep 30
curl -sS -A 'Mozilla/5.0' 'https://lp-gg88-mx-git2.pages.dev/domains.json' | python3 -c '
import sys,json
j=json.load(sys.stdin)
for d in ["gg883.win","quocte.bio","quocte88.us"]:
  e=j.get(d) or j.get("www."+d) or {}
  print(d, e.get("main_url") if isinstance(e,dict) else e)
'
echo '=== custom domains ==='
for d in gg883.win quocte.bio; do
  link=$(curl -sS -A 'Mozilla/5.0' --max-time 15 "https://$d/domains.json" | python3 -c "import sys,json;j=json.load(sys.stdin);d=\"$d\";e=j.get(d)or j.get(\"www.\"+d)or{};print(e.get(\"main_url\")or \"MISSING\")")
  echo "$d -> $link"
done
`, (e,s)=>{ let o=""; s.on("data",d=>o+=d); s.stderr.on("data",d=>o+=d); s.on("close",()=>{console.log(o);c.end();}); });
}).connect({host:"103.146.22.218",username:"root",password:"admin123@!"});
