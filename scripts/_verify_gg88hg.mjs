import { Client } from "ssh2";

const cmd = `
cd /var/www/web-ten-mien
set -a; . ./.env; set +a

echo '=== task/history ==='
python3 - <<'PY'
import json
from pathlib import Path
j=json.loads(Path('data/tasks.json').read_text(encoding='utf-8'))
items=j if isinstance(j,list) else j.get('tasks') or []
t=next(x for x in items if x.get('id')=='task_1789305525820_b6ob1')
print('task', t.get('status'), t.get('currentStep'))
h=json.loads(Path('data/history.json').read_text(encoding='utf-8'))
hi=next(x for x in h if x.get('id')=='hist_1789305525819_jtnyi')
print('hist', hi.get('status'), hi.get('cnameTarget'), hi.get('error'))
own=json.loads(Path('data/domain_ownership.json').read_text(encoding='utf-8'))
print('owner', own.get('gg88hg.com'))
PY

echo '=== pages domain status ==='
node --input-type=module <<'NODE'
import { cfRequest, getPrimaryAccountId } from "./src/cloudflare.js";
const acc = getPrimaryAccountId();
for (const proj of ['lp-gg88-vip-8','lp-gg88-vip-2']) {
  try {
    const domains = await cfRequest(\`/accounts/\${acc}/pages/projects/\${proj}/domains\`);
    const hits = (domains||[]).filter(d => String(d.name||'').includes('gg88hg'));
    if (hits.length) console.log(proj, hits.map(d=>({name:d.name,status:d.status})));
  } catch(e) { console.log(proj, e.message); }
}
NODE

echo '=== domains.json in repo ==='
python3 - <<'PY'
import json
from pathlib import Path
p=Path('/var/www/Landingpages/GG88/ldpape_4d/domains.json')
j=json.loads(p.read_text(encoding='utf-8'))
print('gg88hg' in str(j), j.get('gg88hg.com') or j.get('www.gg88hg.com'))
PY

echo '=== wait + live ==='
for i in 1 2 3 4 5 6; do
  code=$(curl -sI --max-time 15 https://gg88hg.com/ 2>&1 | head -1)
  echo "try $i: $code"
  echo "$code" | grep -q 'HTTP/2 200\\|HTTP/2 301\\|HTTP/2 302\\|HTTP/1.1 200' && break
  sleep 20
done
curl -sI --max-time 20 https://gg88hg.com/ 2>&1 | head -18
echo '--- domains.json live ---'
curl -sS --max-time 15 https://gg88hg.com/domains.json 2>&1 | head -c 450; echo
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
