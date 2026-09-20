import { Client } from "ssh2";

const cmd = `
cd /var/www/Landingpages/LLWIN/lp-6c-xoamaan-llwin
echo '=== domains.json ==='
cat domains.json
echo
echo '=== config.js ==='
cat config.js
echo
echo '=== db_data.json head ==='
python3 - <<'PY'
import json
j=json.load(open('db_data.json',encoding='utf-8'))
print(type(j), list(j)[:30] if isinstance(j,dict) else len(j))
if isinstance(j,dict):
  for k in ['domains','domainConfigs','llwin','links','settings','domainLinks']:
    if k in j: print(k, j[k])
  # print nested keys briefly
  for k,v in j.items():
    if isinstance(v,(dict,list)):
      print('KEY',k, type(v).__name__, (list(v)[:10] if isinstance(v,dict) else len(v)))
    else:
      print('KEY',k, repr(v)[:80])
PY
echo
echo '=== grep domain link in source ==='
grep -RIn --include='*.js' --include='*.html' --include='*.json' -E 'domains\\.json|domainConfigs|main_url|llwin.*link|domainLinks|theo domain' . 2>/dev/null | grep -v node_modules | head -40
echo
echo '=== git remote ==='
git remote -v
git status -sb
echo
echo '=== hub set-link how it writes ==='
grep -n "updateTemplateDomainsJson\\|main_url\\|domains.json" /var/www/web-ten-mien/src/templates.js | head -25
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
