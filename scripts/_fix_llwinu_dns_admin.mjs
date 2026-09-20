import { Client } from "ssh2";

const remote = `
cd /var/www/web-ten-mien
node --input-type=module <<'JS'
import { config } from './src/config.js';
import { cfRequest, cfRequestFull, findZoneByName, getAdminToken } from './src/cloudflare.js';

const DOMAIN = 'llwinu.us';
const CNAME = 'lp-xoamaan-6c-llwin.pages.dev';
const PAGES = 'lp-xoamaan-6c-llwin';
const adminTok = getAdminToken();
if (!adminTok) throw new Error('no admin token');

const zone = await findZoneByName(DOMAIN);
console.log('ZONE', zone.id, zone.account?.id);

async function upsertCname(name) {
  const existing = await cfRequest('/zones/' + zone.id + '/dns_records?per_page=100&name=' + encodeURIComponent(name), { token: adminTok });
  for (const r of existing || []) {
    if (!['A','AAAA','CNAME'].includes(r.type)) continue;
    console.log('DEL', r.type, r.name, r.content);
    await cfRequestFull('/zones/' + zone.id + '/dns_records/' + r.id, { method: 'DELETE', token: adminTok });
  }
  const created = await cfRequest('/zones/' + zone.id + '/dns_records', {
    method: 'POST',
    token: adminTok,
    body: { type: 'CNAME', name, content: CNAME, proxied: true, ttl: 1 },
  });
  console.log('ADD', name, '->', CNAME, created?.id, 'proxied', created?.proxied);
}

await upsertCname(DOMAIN);
await upsertCname('www.' + DOMAIN);

// confirm pages domains status
const acc = config.cloudflare.accountId();
const doms = await cfRequest('/accounts/' + acc + '/pages/projects/' + encodeURIComponent(PAGES) + '/domains');
for (const d of doms || []) {
  if (String(d.name).includes('llwinu') || ['xoaipmang.com','xoamaquocte.vip'].includes(d.name)) {
    console.log('PAGES', d.name, d.status, d.verification_data?.status, d.validation_data?.status);
  }
}

const all = await cfRequest('/zones/' + zone.id + '/dns_records?per_page=100', { token: adminTok });
console.log('DNS_NOW');
for (const r of all || []) console.log(r.type, r.name, r.content, r.proxied);
console.log('DONE');
JS

echo
sleep 8
echo '=== dig ==='
dig +short llwinu.us A
dig +short llwinu.us CNAME
dig +short www.llwinu.us CNAME
echo '=== curl ==='
curl -sI --max-time 20 https://llwinu.us/ | head -18
curl -sS --max-time 20 https://llwinu.us/domains.json | head -c 350
echo
`;

const c = new Client();
c.on("ready", () => {
  c.exec(remote, (e, s) => {
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
