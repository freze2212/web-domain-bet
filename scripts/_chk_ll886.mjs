import { Client } from "ssh2";

const remote = `
process.chdir('/var/www/web-ten-mien');
const { config } = await import('file:///var/www/web-ten-mien/src/config.js');
const { cfRequest, cfRequestFull, findZoneByName } = await import('file:///var/www/web-ten-mien/src/cloudflare.js');

const DOMAIN = 'll886.us';
const frezeAcc = config.cloudflare.accountId();
const adminToken = process.env.CLOUDFLARE_ADMIN_API_TOKEN || '';
const adminAcc = process.env.CLOUDFLARE_ADMIN_ACCOUNT_ID || 'ddead9accc534c1eb074d2a46fffe748';

async function cfAdmin(path) {
  return cfRequestFull(path, { headers: { Authorization: 'Bearer ' + adminToken } });
}

// Zone on Freze?
let frezeZone = null;
try { frezeZone = await findZoneByName(DOMAIN); } catch {}
console.log('FREZE_ZONE', frezeZone && { id: frezeZone.id, status: frezeZone.status, acc: frezeZone.account?.name || frezeZone.account?.id });

// Zone on Admin?
let adminZone = null;
if (adminToken) {
  try {
    const data = await cfAdmin('/zones?name=' + encodeURIComponent(DOMAIN) + '&per_page=5');
    adminZone = (data.result || [])[0] || null;
  } catch (e) { console.log('ADMIN_ZONE_ERR', e.message); }
}
console.log('ADMIN_ZONE', adminZone && { id: adminZone.id, status: adminZone.status, acc: adminZone.account?.name || adminZone.account?.id });

// DNS on whichever zone exists
async function dumpDns(label, zone, mode) {
  if (!zone) return;
  try {
    const data = mode === 'admin'
      ? await cfAdmin('/zones/' + zone.id + '/dns_records?per_page=100')
      : await cfRequestFull('/zones/' + zone.id + '/dns_records?per_page=100');
    const recs = (data.result || []).filter(r => r.name === DOMAIN || r.name === 'www.' + DOMAIN);
    console.log(label + '_DNS', JSON.stringify(recs.map(r => ({ type: r.type, name: r.name, content: r.content, proxied: r.proxied }))));
  } catch (e) { console.log(label + '_DNS_ERR', e.message); }
}
await dumpDns('FREZE', frezeZone, 'freze');
await dumpDns('ADMIN', adminZone, 'admin');

// Search Freze Pages for domain
let page = 1;
const hits = [];
while (page <= 40) {
  const data = await cfRequestFull('/accounts/' + frezeAcc + '/pages/projects?page=' + page + '&per_page=10');
  const batch = data.result || [];
  for (const p of batch) {
    try {
      const doms = await cfRequest('/accounts/' + frezeAcc + '/pages/projects/' + encodeURIComponent(p.name) + '/domains');
      for (const d of doms || []) {
        const n = String(d.name || '').toLowerCase();
        if (n === DOMAIN || n === 'www.' + DOMAIN || n.includes('ll886')) {
          hits.push({ project: p.name, domain: d.name, status: d.status });
        }
      }
    } catch {}
  }
  const total = data.result_info?.total_pages || 1;
  if (page >= total || batch.length === 0) break;
  page++;
}
console.log('FREZE_PAGES_HITS', JSON.stringify(hits, null, 2));

// Also quick Admin Pages scan if token works
if (adminToken) {
  const ahits = [];
  let ap = 1;
  while (ap <= 20) {
    let data;
    try { data = await cfAdmin('/accounts/' + adminAcc + '/pages/projects?page=' + ap + '&per_page=10'); }
    catch (e) { console.log('ADMIN_PAGES_LIST_ERR', e.message); break; }
    const batch = data.result || [];
    for (const p of batch) {
      try {
        const ddata = await cfAdmin('/accounts/' + adminAcc + '/pages/projects/' + encodeURIComponent(p.name) + '/domains');
        for (const d of ddata.result || []) {
          const n = String(d.name || '').toLowerCase();
          if (n === DOMAIN || n === 'www.' + DOMAIN || n.includes('ll886')) {
            ahits.push({ project: p.name, domain: d.name, status: d.status });
          }
        }
      } catch {}
    }
    const total = data.result_info?.total_pages || 1;
    if (ap >= total || batch.length === 0) break;
    ap++;
  }
  console.log('ADMIN_PAGES_HITS', JSON.stringify(ahits, null, 2));
}
`;

const b64 = Buffer.from(remote).toString("base64");
const c = new Client();
c.on("ready", () => {
  c.exec(`echo '${b64}' | base64 -d > /tmp/_chk_ll886.mjs && node /tmp/_chk_ll886.mjs`, (e, s) => {
    let o = "";
    s.on("data", (d) => (o += d));
    s.stderr.on("data", (d) => (o += d));
    s.on("close", () => {
      console.log(o);
      c.end();
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
