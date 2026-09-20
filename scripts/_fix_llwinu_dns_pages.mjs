import { Client } from "ssh2";

const remote = `
cd /var/www/web-ten-mien
node --input-type=module <<'JS'
import { config } from './src/config.js';
import { cfRequest, cfRequestFull, findZoneByName } from './src/cloudflare.js';

const DOMAIN = 'llwinu.us';
const PAGES = 'lp-xoamaan-6c-llwin';
const CNAME = 'lp-xoamaan-6c-llwin.pages.dev';
const LINK = 'https://13llwin.com/?id=585339953';

const zone = await findZoneByName(DOMAIN);
if (!zone) throw new Error('no zone');
console.log('ZONE', zone.id, zone.status, zone.name, 'account', zone.account?.id);

// Try list DNS with full error body
try {
  const recs = await cfRequest('/zones/' + zone.id + '/dns_records?per_page=100');
  console.log('DNS_COUNT', (recs||[]).length);
  for (const r of recs||[]) console.log('DNS', r.type, r.name, r.content, r.proxied);
} catch (e) {
  console.log('DNS_LIST_ERR', e.message);
}

// Try pages domain add
const acc = config.cloudflare.accountId();
console.log('ACC_CONFIG', acc);
try {
  const doms = await cfRequest('/accounts/' + acc + '/pages/projects/' + encodeURIComponent(PAGES) + '/domains');
  console.log('PAGES_DOMAINS', (doms||[]).map(d => d.name + ':' + d.status));
} catch (e) {
  console.log('PAGES_LIST_ERR', e.message);
}

try {
  const added = await cfRequestFull(
    '/accounts/' + acc + '/pages/projects/' + encodeURIComponent(PAGES) + '/domains',
    { method: 'POST', body: { name: DOMAIN } }
  );
  console.log('PAGES_ADD', JSON.stringify(added).slice(0, 400));
} catch (e) {
  console.log('PAGES_ADD_ERR', e.message);
}
try {
  const addedWww = await cfRequestFull(
    '/accounts/' + acc + '/pages/projects/' + encodeURIComponent(PAGES) + '/domains',
    { method: 'POST', body: { name: 'www.' + DOMAIN } }
  );
  console.log('PAGES_ADD_WWW', JSON.stringify(addedWww).slice(0, 300));
} catch (e) {
  console.log('PAGES_ADD_WWW_ERR', e.message);
}

// Upsert CNAME DNS
async function upsertCname(name) {
  try {
    const existing = await cfRequest('/zones/' + zone.id + '/dns_records?type=CNAME&name=' + encodeURIComponent(name));
    for (const r of existing || []) {
      console.log('DEL', r.type, r.name, r.content);
      await cfRequestFull('/zones/' + zone.id + '/dns_records/' + r.id, { method: 'DELETE' });
    }
    const aRecs = await cfRequest('/zones/' + zone.id + '/dns_records?type=A&name=' + encodeURIComponent(name));
    for (const r of aRecs || []) {
      console.log('DEL_A', r.name, r.content);
      await cfRequestFull('/zones/' + zone.id + '/dns_records/' + r.id, { method: 'DELETE' });
    }
  } catch (e) {
    console.log('CLEAN_ERR', name, e.message);
  }
  try {
    const created = await cfRequest('/zones/' + zone.id + '/dns_records', {
      method: 'POST',
      body: { type: 'CNAME', name, content: CNAME, proxied: true, ttl: 1 },
    });
    console.log('ADD_CNAME', name, '->', CNAME, created?.id, created?.proxied);
  } catch (e) {
    console.log('ADD_CNAME_ERR', name, e.message);
  }
}

await upsertCname(DOMAIN);
await upsertCname('www.' + DOMAIN);

console.log('DONE');
JS
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
