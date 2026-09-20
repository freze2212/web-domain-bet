import { Client } from "ssh2";

const cmd = `
export TZ=Asia/Ho_Chi_Minh
date
echo '=== LP folder ==='
ls -la /var/www/Landingpages/LLWIN/lp-6c-xoamaan-llwin 2>/dev/null | head -20
echo
echo '=== domains.json ==='
python3 - <<'PY'
import json,os
p='/var/www/Landingpages/LLWIN/lp-6c-xoamaan-llwin/domains.json'
print('exists', os.path.exists(p))
if os.path.exists(p):
  j=json.load(open(p,encoding='utf-8'))
  print('keys', len(j))
  for k in ['llwinu.us','www.llwinu.us']:
    print(k, j.get(k))
  # sample first 3
  for i,(k,v) in enumerate(list(j.items())[:5]):
    print(' sample', k, v if isinstance(v,str) else (v.get('main_url') if isinstance(v,dict) else v))
PY
echo
echo '=== live domains.json pages ==='
curl -sS --max-time 15 'https://lp-xoamaan-6c-llwin.pages.dev/domains.json' | python3 -c "import sys,json; j=json.load(sys.stdin); print('keys',len(j)); print('llwinu', j.get('llwinu.us')); print('www', j.get('www.llwinu.us'))" 2>&1 | head -20
echo
echo '=== live llwinu.us ==='
curl -sI --max-time 15 https://llwinu.us/ | head -15
curl -sS --max-time 15 https://llwinu.us/domains.json 2>&1 | head -c 500
echo
echo
echo '=== hub ownership ==='
python3 - <<'PY'
import json,os
p='/var/www/web-ten-mien/data/domain_ownership.json'
if os.path.exists(p):
  j=json.load(open(p,encoding='utf-8'))
  print('llwinu', j.get('llwinu.us') or j.get('www.llwinu.us'))
else:
  print('no ownership file')
PY
echo
echo '=== templates on hub has xoamaan 6c? ==='
grep -n 'lp_xoamaan_6c_llwin\\|lp-xoamaan-6c-llwin' /var/www/web-ten-mien/src/templates.js | head -10
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
