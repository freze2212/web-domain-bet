import { Client } from "ssh2";

const remote = `
process.chdir('/var/www/web-ten-mien');
const { cfRequestFull } = await import('file:///var/www/web-ten-mien/src/cloudflare.js');
const frezeToken = process.env.CLOUDFLARE_API_TOKEN;
const adminToken = process.env.CLOUDFLARE_ADMIN_API_TOKEN || '';
const DOMAIN = 'll886.us';

async function zonesByName(token, label) {
  const r = await fetch('https://api.cloudflare.com/client/v4/zones?name=' + encodeURIComponent(DOMAIN) + '&per_page=20', {
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }
  });
  const j = await r.json();
  console.log(label + '_HTTP', r.status, 'success=' + j.success, 'count=' + (j.result||[]).length, JSON.stringify(j.errors||[]).slice(0,200));
  for (const z of j.result || []) {
    console.log(label + '_ZONE', z.id, z.status, z.account?.name, z.account?.id);
  }
}

await zonesByName(frezeToken, 'FREZE');
if (adminToken) await zonesByName(adminToken, 'ADMIN');

// search pages projects names containing ll886 / any domain match via membership
const frezeAcc = process.env.CLOUDFLARE_ACCOUNT_ID;
let page = 1, found = [];
while (page <= 50) {
  const data = await cfRequestFull('/accounts/' + frezeAcc + '/pages/projects?page=' + page + '&per_page=10');
  for (const p of data.result || []) {
    try {
      const d = await cfRequestFull('/accounts/' + frezeAcc + '/pages/projects/' + encodeURIComponent(p.name) + '/domains');
      for (const x of d.result || []) {
        if (String(x.name).toLowerCase().includes('ll886') || String(x.name).toLowerCase().includes('886.us')) {
          found.push({ project: p.name, domain: x.name, status: x.status });
        }
      }
    } catch {}
  }
  if (page >= (data.result_info?.total_pages || 1)) break;
  page++;
}
console.log('PAGES_MATCH', JSON.stringify(found));

// also list zones matching *886*
for (const [label, token] of [['FREZE', frezeToken], ['ADMIN', adminToken]].filter(x => x[1])) {
  const r = await fetch('https://api.cloudflare.com/client/v4/zones?per_page=50&name=contains:886', {
    headers: { Authorization: 'Bearer ' + token }
  });
  const j = await r.json();
  // CF may not support contains - fallback search
  console.log(label + '_SEARCH', r.status, (j.result||[]).slice(0,5).map(z=>z.name));
}
`;

const b64 = Buffer.from(remote).toString("base64");
const c = new Client();
c.on("ready", () => {
  c.exec(`echo '${b64}' | base64 -d > /tmp/_chk_ll886b.mjs && node /tmp/_chk_ll886b.mjs`, (e, s) => {
    let o = "";
    s.on("data", (d) => (o += d));
    s.stderr.on("data", (d) => (o += d));
    s.on("close", () => {
      console.log(o);
      c.end();
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
