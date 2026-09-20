import { Client } from "ssh2";

const remote = `
export TZ=Asia/Ho_Chi_Minh
date
DOMAIN=llwinu.us
echo '=== DNS dig ==='
dig +short $DOMAIN A
dig +short $DOMAIN CNAME
dig +short www.$DOMAIN A
dig +short www.$DOMAIN CNAME
echo
echo '=== CF zone / DNS / Pages ==='
cd /var/www/web-ten-mien
node --input-type=module <<'JS'
import { config } from './src/config.js';
import { cfRequest, findZoneByName, getAllPagesProjectsForAccount } from './src/cloudflare.js';
const DOMAIN = 'llwinu.us';
const zone = await findZoneByName(DOMAIN);
console.log('ZONE', zone ? { id: zone.id, status: zone.status, name: zone.name } : null);
if (zone) {
  const recs = await cfRequest('/zones/' + zone.id + '/dns_records?per_page=100');
  for (const r of recs || []) {
    if (r.name === DOMAIN || r.name === 'www.' + DOMAIN || String(r.name).endsWith(DOMAIN)) {
      console.log('DNS', r.type, r.name, r.content, 'proxied', r.proxied);
    }
  }
}
const acc = config.cloudflare.accountId();
const projects = await getAllPagesProjectsForAccount(acc);
for (const p of projects || []) {
  if (!String(p.name || '').includes('xoamaan') && !String(p.name || '').includes('llwin')) continue;
  try {
    const doms = await cfRequest('/accounts/' + acc + '/pages/projects/' + encodeURIComponent(p.name) + '/domains');
    for (const d of doms || []) {
      if (String(d.name || '').includes('llwinu')) {
        console.log('PAGES', p.name, d.name, d.status, d.verification_data || d.certificate_authority || '');
      }
    }
  } catch (e) {}
}
// also scan all projects for llwinu
for (const p of projects || []) {
  try {
    const doms = await cfRequest('/accounts/' + acc + '/pages/projects/' + encodeURIComponent(p.name) + '/domains');
    for (const d of doms || []) {
      if (String(d.name || '').includes('llwinu')) console.log('HIT_ANY', p.name, d.name, d.status);
    }
  } catch {}
}
JS

echo
echo '=== curl live ==='
curl -sI --max-time 15 https://llwinu.us/ 2>&1 | head -20
echo '---'
curl -sS --max-time 15 https://llwinu.us/domains.json 2>&1 | head -c 400
echo
echo '--- pages domains.json ---'
curl -sS --max-time 15 'https://lp-xoamaan-6c-llwin.pages.dev/domains.json' | head -c 400
echo
echo
echo '=== hub ownership / hist ==='
python3 - <<'PY'
import json,os,glob
for p in ['/var/www/web-ten-mien/data/domain_ownership.json']:
  if not os.path.exists(p):
    print('missing',p); continue
  j=json.load(open(p,encoding='utf-8'))
  print('ownership', j.get('llwinu.us') or j.get('www.llwinu.us'))
# history files
hits=[]
for f in glob.glob('/var/www/web-ten-mien/data/**/*', recursive=True):
  if not f.endswith(('.json','.jsonl','.log')): continue
  try:
    t=open(f,encoding='utf-8',errors='ignore').read()
  except: continue
  if 'llwinu.us' in t:
    hits.append(f)
print('files mentioning llwinu', hits[:15])
PY
`;

const c = new Client();
c.on("ready", () => {
  c.exec(remote, (e, s) => {
    let o = "";
    s.on("data", (d) => (o += d.toString()));
    s.stderr.on("data", (d) => (o += d.toString()));
    s.on("close", () => {
      console.log(o || "(empty)");
      c.end();
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
