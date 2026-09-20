import { Client } from "ssh2";

const remote = `
process.chdir('/var/www/web-ten-mien');
const { config } = await import('file:///var/www/web-ten-mien/src/config.js');
const { cfRequest, cfRequestFull, findZoneByName, getAllPagesProjectsForAccount } = await import('file:///var/www/web-ten-mien/src/cloudflare.js');

const DOMAIN = 'autotest-6888.top';
const VPS_IP = '103.146.22.218';
const acc = config.cloudflare.accountId();

const zone = await findZoneByName(DOMAIN);
if (!zone) throw new Error('zone missing');
console.log('ZONE', zone.id, zone.status);

const recs = await cfRequest('/zones/' + zone.id + '/dns_records?per_page=200');
const targets = new Set([DOMAIN, 'www.' + DOMAIN]);
for (const r of recs || []) {
  if (!targets.has(r.name)) continue;
  console.log('DNS_NOW', r.type, r.name, r.content, 'proxied', r.proxied, r.id);
}

const projects = await getAllPagesProjectsForAccount(acc);
for (const p of projects || []) {
  try {
    const doms = await cfRequest('/accounts/' + acc + '/pages/projects/' + encodeURIComponent(p.name) + '/domains');
    for (const d of doms || []) {
      if (String(d.name || '').includes('autotest-6888')) {
        console.log('ON_PAGES', p.name, d.name, d.status);
        await cfRequestFull(
          '/accounts/' + acc + '/pages/projects/' + encodeURIComponent(p.name) + '/domains/' + encodeURIComponent(d.name),
          { method: 'DELETE' }
        );
        console.log('PAGES_DEL', p.name, d.name);
      }
    }
  } catch (e) {
    // ignore
  }
}

for (const r of recs || []) {
  if (!targets.has(r.name)) continue;
  if (!['A', 'AAAA', 'CNAME'].includes(r.type)) continue;
  const wantA = r.type === 'A' && r.content === VPS_IP && r.proxied === true;
  if (wantA) {
    console.log('KEEP', r.type, r.name, r.content);
    continue;
  }
  console.log('DEL', r.type, r.name, r.content);
  await cfRequestFull('/zones/' + zone.id + '/dns_records/' + r.id, { method: 'DELETE' });
}

const after = await cfRequest('/zones/' + zone.id + '/dns_records?per_page=200');
const have = new Set((after || []).filter((r) => targets.has(r.name) && r.type === 'A' && r.content === VPS_IP).map((r) => r.name));
for (const name of [DOMAIN, 'www.' + DOMAIN]) {
  if (have.has(name)) {
    console.log('HAS_A', name);
    continue;
  }
  const created = await cfRequest('/zones/' + zone.id + '/dns_records', {
    method: 'POST',
    body: { type: 'A', name, content: VPS_IP, proxied: true, ttl: 1 },
  });
  console.log('ADD_A', name, created?.id, created?.proxied);
}

try {
  const ssl = await cfRequest('/zones/' + zone.id + '/settings/ssl');
  console.log('SSL_MODE', ssl?.value);
  if (ssl?.value === 'flexible') {
    await cfRequestFull('/zones/' + zone.id + '/settings/ssl', {
      method: 'PATCH',
      body: { value: 'full' },
    });
    console.log('SSL_SET full');
  }
} catch (e) {
  console.log('ssl err', e.message);
}

console.log('DONE_DNS');
`;

const cmd = `
echo '${Buffer.from(remote).toString("base64")}' | base64 -d > /tmp/_fix_autotest_media.mjs
node /tmp/_fix_autotest_media.mjs
echo
echo '=== SAMPLE FILES ==='
ls -la /var/www/media-vault/uploads | head -20
echo
echo '=== LOCAL SAMPLE ==='
SAMPLE=$(ls /var/www/media-vault/uploads | head -1)
echo SAMPLE=$SAMPLE
curl -sI --max-time 8 "http://127.0.0.1:3500/uploads/$SAMPLE" | head -12
curl -sI --max-time 8 -H "Host: autotest-6888.top" "https://127.0.0.1/uploads/$SAMPLE" -k | head -15
echo
echo '=== BODY HOME SNIP ==='
curl -s --max-time 15 https://autotest-6888.top/ | head -c 400
echo
`;

const c = new Client();
c.on("ready", () => {
  c.exec(cmd, (e, s) => {
    let o = "";
    s.on("data", (d) => (o += d.toString()));
    s.stderr.on("data", (d) => (o += d.toString()));
    s.on("close", (code) => {
      console.log(o || "(empty)");
      console.log("exit", code);
      c.end();
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
