/**
 * Point domains to origin IP: remove Pages custom domains, set A DNS-only.
 */
import { Client } from "ssh2";

const DOMAINS = ["ggqt88.vip", "g88vip.vip"];
const WANT_IP = "160.191.87.116";

const remote = `
process.chdir('/var/www/web-ten-mien');
const fs = await import('node:fs');
const { config } = await import('file:///var/www/web-ten-mien/src/config.js');
const { cfRequest, cfRequestFull, findZoneByName } = await import('file:///var/www/web-ten-mien/src/cloudflare.js');

const DOMAINS = ${JSON.stringify(DOMAINS)};
const WANT_IP = '${WANT_IP}';
const frezeAcc = config.cloudflare.accountId();
const adminAcc = process.env.CLOUDFLARE_ADMIN_ACCOUNT_ID || 'ddead9accc534c1eb074d2a46fffe748';
const adminToken = process.env.CLOUDFLARE_ADMIN_API_TOKEN || '';

async function cfAdmin(path, options = {}) {
  if (!adminToken) throw new Error('no admin token');
  return cfRequestFull(path, {
    ...options,
    headers: { ...(options.headers || {}), Authorization: 'Bearer ' + adminToken },
  });
}

async function findZoneAny(domain) {
  let zone = null;
  try { zone = await findZoneByName(domain); } catch {}
  if (zone) return { zone, via: 'freze' };
  if (adminToken) {
    try {
      const data = await cfAdmin('/zones?name=' + encodeURIComponent(domain) + '&per_page=5');
      const z = (data.result || [])[0];
      if (z) return { zone: z, via: 'admin' };
    } catch (e) {
      console.log('ADMIN_ZONE_ERR', domain, e.message);
    }
  }
  try {
    const cache = JSON.parse(fs.readFileSync('data/cf_zones_cache.json', 'utf8'));
    const hit = cache.find(x => x.name === domain && x.status === 'active');
    if (hit) return { zone: hit, via: 'cache' };
  } catch {}
  return { zone: null, via: null };
}

async function listPagesProjects(accountId, tokenMode) {
  const projects = [];
  let page = 1;
  while (page <= 50) {
    const path = '/accounts/' + accountId + '/pages/projects?page=' + page + '&per_page=10';
    let data;
    try {
      data = tokenMode === 'admin' ? await cfAdmin(path) : await cfRequestFull(path);
    } catch (e) {
      console.log('PAGES_LIST_ERR', accountId, e.message);
      break;
    }
    const batch = data.result || [];
    projects.push(...batch);
    const total = data.result_info?.total_pages || 1;
    if (page >= total || batch.length === 0) break;
    page++;
  }
  return projects;
}

async function removeFromPages(accountId, tokenMode, domain) {
  const projects = await listPagesProjects(accountId, tokenMode);
  const removed = [];
  for (const p of projects) {
    try {
      const pathList = '/accounts/' + accountId + '/pages/projects/' + encodeURIComponent(p.name) + '/domains';
      const data = tokenMode === 'admin' ? await cfAdmin(pathList) : await cfRequestFull(pathList);
      const doms = data.result || [];
      for (const d of doms) {
        const name = String(d.name || '').toLowerCase();
        if (name !== domain && name !== 'www.' + domain) continue;
        const delPath = pathList + '/' + encodeURIComponent(d.name);
        try {
          if (tokenMode === 'admin') await cfAdmin(delPath, { method: 'DELETE' });
          else await cfRequestFull(delPath, { method: 'DELETE' });
          removed.push({ project: p.name, domain: d.name, status: d.status });
        } catch (e) {
          removed.push({ project: p.name, domain: d.name, error: e.message });
        }
      }
    } catch {}
  }
  return removed;
}

async function pointDns(zone, tokenMode, domain) {
  const zid = zone.id;
  const listPath = '/zones/' + zid + '/dns_records?per_page=100';
  const listData = tokenMode === 'admin' ? await cfAdmin(listPath) : await cfRequestFull(listPath);
  const recs = listData.result || [];
  const targets = new Set([domain, 'www.' + domain]);
  for (const r of recs) {
    if (!targets.has(r.name)) continue;
    if (!['A', 'AAAA', 'CNAME'].includes(r.type)) continue;
    const delPath = '/zones/' + zid + '/dns_records/' + r.id;
    try {
      if (tokenMode === 'admin') await cfAdmin(delPath, { method: 'DELETE' });
      else await cfRequestFull(delPath, { method: 'DELETE' });
      console.log('  DEL', r.type, r.name, r.content);
    } catch (e) {
      console.log('  DEL_ERR', r.name, e.message);
    }
  }
  for (const name of [domain, 'www.' + domain]) {
    const body = { type: 'A', name, content: WANT_IP, proxied: false, ttl: 300 };
    try {
      const created = tokenMode === 'admin'
        ? await cfAdmin('/zones/' + zid + '/dns_records', { method: 'POST', body })
        : await cfRequestFull('/zones/' + zid + '/dns_records', { method: 'POST', body });
      console.log('  ADD A', name, '->', WANT_IP, 'proxied=false id=' + (created.result?.id || ''));
    } catch (e) {
      console.log('  ADD_ERR', name, e.message);
    }
  }
}

for (const domain of DOMAINS) {
  console.log('\\n====', domain, '====');
  try {
    const { zone, via } = await findZoneAny(domain);
    if (!zone) {
      console.log('NO_ZONE');
      continue;
    }
    const accId = zone.account?.id || zone.accountId || '';
    const accName = zone.account?.name || zone.accountName || '';
    let tokenMode = 'freze';
    if (via === 'admin' || accId === adminAcc || /admin@itkjc/i.test(accName)) tokenMode = 'admin';
    console.log('ZONE', zone.id, 'via=' + via, 'acc=' + (accName || accId), 'mode=' + tokenMode);

    const remFreze = await removeFromPages(frezeAcc, 'freze', domain);
    console.log('PAGES_FREZE_REMOVED', JSON.stringify(remFreze));
    if (tokenMode === 'admin' && adminToken) {
      const remAdmin = await removeFromPages(adminAcc, 'admin', domain);
      console.log('PAGES_ADMIN_REMOVED', JSON.stringify(remAdmin));
    }

    await pointDns(zone, tokenMode === 'admin' ? 'admin' : 'freze', domain);
    console.log('DONE', domain);
  } catch (e) {
    console.log('FAIL', domain, e.message);
  }
}
console.log('\\nALL_DONE');
`;

const b64 = Buffer.from(remote).toString("base64");
const c = new Client();
c.on("ready", () => {
  c.exec(`echo '${b64}' | base64 -d > /tmp/_batch_point_ip2.mjs && node /tmp/_batch_point_ip2.mjs`, (e, s) => {
    let o = "";
    s.on("data", (d) => (o += d));
    s.stderr.on("data", (d) => (o += d));
    s.on("close", (code) => {
      console.log(o);
      c.end();
      process.exit(code || 0);
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
