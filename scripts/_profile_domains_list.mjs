import { Client } from "ssh2";

const cmd = `
export TZ=Asia/Ho_Chi_Minh
cd /var/www/web-ten-mien
echo '=== time domains-list ==='
# mint or use existing - try local curl with cookie/jwt if any
python3 - <<'PY'
import time, json, urllib.request, os

# try without auth first
for url in [
  'http://127.0.0.1:3000/api/domains-list?page=1&limit=50&q=gg888qt',
  'http://127.0.0.1:3080/api/domains-list?page=1&limit=50&q=gg888qt',
  'http://127.0.0.1:3200/api/domains-list?page=1&limit=50&q=gg888qt',
]:
  try:
    t0=time.time()
    r=urllib.request.urlopen(url, timeout=60)
    body=r.read()
    dt=time.time()-t0
    print('URL', url, 'status', r.status, 'ms', int(dt*1000), 'bytes', len(body))
    j=json.loads(body)
    print(' keys', list(j)[:8], 'total', j.get('total'), 'count', j.get('count'))
  except Exception as e:
    print('fail', url, e)
PY

echo
echo '=== profile listAllDomains ==='
node --input-type=module <<'JS'
import { performance } from 'node:perf_hooks';
const t0 = performance.now();
const { listAllDomains, getAllDomainsJsonFiles } = await import('./src/repo-scanner.js');
const t1 = performance.now();
const files = getAllDomainsJsonFiles();
const t2 = performance.now();
const domains = listAllDomains();
const t3 = performance.now();
console.log('import_ms', (t1-t0).toFixed(0));
console.log('files', files.length, 'scan_ms', (t2-t1).toFixed(0));
console.log('domains', domains.length, 'list_ms', (t3-t2).toFixed(0));
const { buildEnrichedDomainsList, queryEnrichedDomainsList } = await import('./src/domains-list-service.js');
const t4 = performance.now();
const full = buildEnrichedDomainsList({ isAdminUser: true, userAllowedDomains: [] });
const t5 = performance.now();
const q = queryEnrichedDomainsList({ isAdminUser: true, userAllowedDomains: [] }, { page: 1, limit: 50, q: 'gg888qt' });
const t6 = performance.now();
const q2 = queryEnrichedDomainsList({ isAdminUser: true, userAllowedDomains: [] }, { page: 1, limit: 50, q: 'gg888qt' });
const t7 = performance.now();
console.log('enrich_ms', (t5-t4).toFixed(0), 'enriched', full.length);
console.log('query1_ms', (t6-t5).toFixed(0), 'total', q.total, 'count', q.count);
console.log('query2_cached_ms', (t7-t6).toFixed(0));
JS

echo
echo '=== pm2 hub ==='
pm2 show web-tenmienbet | grep -E 'status|uptime|script|cwd|restarts' | head -15
ss -tlnp | grep -E '3000|3080|3200|3010' || true
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
