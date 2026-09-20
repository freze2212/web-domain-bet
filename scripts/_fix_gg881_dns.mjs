import { Client } from "ssh2";

const remote = `
process.chdir('/var/www/web-ten-mien');
const { config } = await import('file:///var/www/web-ten-mien/src/config.js');
const { cfRequest, cfRequestFull, findZoneByName, getAllPagesProjectsForAccount } = await import('file:///var/www/web-ten-mien/src/cloudflare.js');
const DOMAIN = 'gg881.co';
const zone = await findZoneByName(DOMAIN);
if (!zone) { console.log('NO_ZONE'); process.exit(1); }
const acc = config.cloudflare.accountId();
const zoneId = zone.id;

// 1) Find + remove from ALL Pages projects (exact domain)
const projects = await getAllPagesProjectsForAccount(acc);
const hits = [];
for (const p of projects || []) {
  try {
    const doms = await cfRequest('/accounts/' + acc + '/pages/projects/' + encodeURIComponent(p.name) + '/domains');
    for (const d of doms || []) {
      if (String(d.name || '').toLowerCase() === DOMAIN) {
        hits.push({ project: p.name, domain: d.name, status: d.status });
      }
    }
  } catch (e) {
    // ignore list errors
  }
}
console.log('PAGES_BEFORE', JSON.stringify(hits));

for (const h of hits) {
  const path = '/accounts/' + acc + '/pages/projects/' + encodeURIComponent(h.project) + '/domains/' + encodeURIComponent(DOMAIN);
  const r = await cfRequestFull(path, { method: 'DELETE' });
  console.log('DELETE_PAGES', h.project, r?.status || r?.success, JSON.stringify(r?.errors || r?.result || r).slice(0, 300));
}

// 2) Confirm DNS still A -> IP
const recs = await cfRequest('/zones/' + zoneId + '/dns_records?per_page=100');
console.log('DNS', JSON.stringify((recs || []).map(r => ({
  id: r.id, type: r.type, name: r.name, content: r.content, proxied: r.proxied
}))));

// Ensure apex A is correct
const apex = (recs || []).find(r => r.type === 'A' && r.name === DOMAIN);
const WANT = '160.191.87.116';
if (!apex) {
  const created = await cfRequestFull('/zones/' + zoneId + '/dns_records', {
    method: 'POST',
    body: JSON.stringify({ type: 'A', name: DOMAIN, content: WANT, proxied: true, ttl: 1 })
  });
  console.log('CREATE_A', JSON.stringify(created?.result || created?.errors));
} else if (apex.content !== WANT) {
  const upd = await cfRequestFull('/zones/' + zoneId + '/dns_records/' + apex.id, {
    method: 'PUT',
    body: JSON.stringify({ type: 'A', name: DOMAIN, content: WANT, proxied: true, ttl: 1 })
  });
  console.log('UPDATE_A', JSON.stringify(upd?.result || upd?.errors));
} else {
  console.log('A_OK', apex.content, 'proxied=' + apex.proxied);
}

// 3) Purge cache
const purge = await cfRequestFull('/zones/' + zoneId + '/purge_cache', {
  method: 'POST',
  body: JSON.stringify({ purge_everything: true })
});
console.log('PURGE', purge?.success, JSON.stringify(purge?.errors || {}));

// 4) Re-check Pages
const hits2 = [];
for (const p of projects || []) {
  try {
    const doms = await cfRequest('/accounts/' + acc + '/pages/projects/' + encodeURIComponent(p.name) + '/domains');
    for (const d of doms || []) {
      if (String(d.name || '').toLowerCase() === DOMAIN) hits2.push({ project: p.name, domain: d.name, status: d.status });
    }
  } catch {}
}
console.log('PAGES_AFTER', JSON.stringify(hits2));
`;

const b64 = Buffer.from(remote).toString("base64");
const c = new Client();
c.on("ready", () => {
  c.exec(`echo '${b64}' | base64 -d > /tmp/_fix_gg881.mjs && node /tmp/_fix_gg881.mjs`, (e, s) => {
    let o = "";
    s.on("data", (d) => (o += d));
    s.stderr.on("data", (d) => (o += d));
    s.on("close", () => {
      console.log(o);
      c.end();
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
