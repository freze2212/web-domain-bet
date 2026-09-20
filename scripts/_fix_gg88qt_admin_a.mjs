/**
 * A) Fix gg88qt.com on Admin account only.
 * - Apex CNAME: gg88-lp-5uae-admin.pages.dev
 * - www CNAME was wrong (gg88-lp-5uae-2) → align to admin project
 * - Restore domains.json entry on that Pages project
 * - Keep Freze zone/pending alone
 */
import { Client } from "ssh2";

const DO_FIX = process.argv.includes("--fix");
const DOMAIN = "gg88qt.com";
const ADMIN_ACC = "ddead9accc534c1eb074d2a46fffe748";
const ADMIN_ZONE = "c6334ec0317fd7e86beb6e9d09f4b61b";
const PAGES = "gg88-lp-5uae-admin";
const LINK = "https://www.gg8846.com/?id=427343889";

const remote = `
process.chdir('/var/www/web-ten-mien');
const { config } = await import('file:///var/www/web-ten-mien/src/config.js');
const { cfRequest, cfRequestFull } = await import('file:///var/www/web-ten-mien/src/cloudflare.js');
const fs = await import('fs');
const { execSync } = await import('child_process');
const path = await import('path');

const DO_FIX = ${DO_FIX ? "true" : "false"};
const DOMAIN = '${DOMAIN}';
const ADMIN_ACC = '${ADMIN_ACC}';
const ADMIN_ZONE = '${ADMIN_ZONE}';
const PAGES = '${PAGES}';
const LINK = '${LINK}';
const target = PAGES + '.pages.dev';

const vipPath = '/var/www/Landingpages/GG88/ldpape_4d-5-quocgia/domains.json';
const vipDisk = JSON.parse(fs.readFileSync(vipPath,'utf8'));
const fromDisk = vipDisk[DOMAIN] || vipDisk['www.'+DOMAIN];
const link = (fromDisk && (fromDisk.main_url || fromDisk.url)) || LINK;
console.log('LINK_USE', link);
console.log('DISK_HAS', !!vipDisk[DOMAIN], 'keys', Object.keys(vipDisk).length);

// Project exists?
try {
  const proj = await cfRequest('/accounts/'+ADMIN_ACC+'/pages/projects/'+encodeURIComponent(PAGES));
  console.log('PROJECT', proj?.name, 'branch', proj?.production_branch, 'source', proj?.source?.type || proj?.source?.config?.owner);
} catch (e) {
  console.log('PROJECT_ERR', e.message);
}

// Domains on project
try {
  const doms = await cfRequest('/accounts/'+ADMIN_ACC+'/pages/projects/'+encodeURIComponent(PAGES)+'/domains');
  console.log('PROJECT_DOMAINS', (doms||[]).map(d=>d.name+':'+d.status));
} catch (e) {
  console.log('PROJECT_DOMAINS_ERR', e.message);
}

const recs = await cfRequest('/zones/'+ADMIN_ZONE+'/dns_records?per_page=100');
console.log('DNS_NOW', (recs||[]).filter(r=>['A','AAAA','CNAME'].includes(r.type)).map(r=>r.name+' '+r.type+' '+r.content));

if (!DO_FIX) {
  console.log('DRY_RUN — rerun with --fix');
  process.exit(0);
}

async function upsertCname(name, content) {
  const existing = (recs||[]).find(r => r.name === name && ['CNAME','A','AAAA'].includes(r.type));
  if (existing && existing.type === 'CNAME' && String(existing.content).replace(/\\.$/,'') === content) {
    console.log('CNAME_OK', name);
    return;
  }
  if (existing) {
    await cfRequestFull('/zones/'+ADMIN_ZONE+'/dns_records/'+existing.id, { method: 'DELETE' });
    console.log('DNS_DEL', existing.type, name);
  }
  await cfRequest('/zones/'+ADMIN_ZONE+'/dns_records', {
    method: 'POST',
    body: { type: 'CNAME', name, content, proxied: true, ttl: 1 },
  });
  console.log('CNAME_SET', name, '->', content);
}

await upsertCname(DOMAIN, target);
await upsertCname('www.'+DOMAIN, target);

for (const name of [DOMAIN, 'www.'+DOMAIN]) {
  try {
    await cfRequestFull('/accounts/'+ADMIN_ACC+'/pages/projects/'+encodeURIComponent(PAGES)+'/domains', {
      method: 'POST',
      body: { name },
    });
    console.log('PAGES_ADD_OK', name);
  } catch (e) {
    console.log('PAGES_ADD', name, e.message.slice(0,180));
  }
}

// Disable conflicting 302 page rules on Admin zone (want LP with link, not bare redirect conflict)
try {
  const rules = await cfRequest('/zones/'+ADMIN_ZONE+'/pagerules');
  for (const rule of rules || []) {
    const isFwd = (rule.actions||[]).some(a => a.id === 'forwarding_url');
    if (!isFwd) continue;
    await cfRequestFull('/zones/'+ADMIN_ZONE+'/pagerules/'+rule.id, { method: 'DELETE' });
    console.log('DELETED_302_RULE', rule.id);
  }
} catch (e) {
  console.log('PAGERULE_ERR', e.message.slice(0,200));
}

// Build domains.json for admin project: start from healthy 5uae disk (has entries) ensure gg88qt present
const out = { ...vipDisk };
const entry = { main_url: link, messenger_url: link };
out[DOMAIN] = entry;
out['www.'+DOMAIN] = entry;

// Deploy via wrangler if available to Admin project — else write temp + wrangler pages deploy
const tmp = '/tmp/gg88-lp-5uae-admin-deploy';
execSync('rm -rf '+tmp+' && mkdir -p '+tmp);
// copy minimal site from 5uae folder
const src = '/var/www/Landingpages/GG88/ldpape_4d-5-quocgia';
execSync('cp -a '+src+'/. '+tmp+'/');
// remove .git from deploy dir noise
execSync('rm -rf '+tmp+'/.git');
fs.writeFileSync(path.join(tmp,'domains.json'), JSON.stringify(out, null, 2));
console.log('DEPLOY_JSON_KEYS', Object.keys(out).length, 'hasSelf', !!out[DOMAIN]);

const token = config.cloudflare.token();
process.env.CLOUDFLARE_API_TOKEN = token;
process.env.CLOUDFLARE_ACCOUNT_ID = ADMIN_ACC;
try {
  const cmd = 'npx --yes wrangler@3 pages deploy '+tmp+' --project-name='+PAGES+' --branch=main --commit-dirty=true';
  console.log('WRANGLER', cmd);
  execSync(cmd, { stdio: 'inherit', env: { ...process.env, CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: ADMIN_ACC } });
  console.log('DEPLOY_OK');
} catch (e) {
  console.log('DEPLOY_ERR', (e.stderr||e.message||'').toString().slice(0,500));
  throw e;
}

console.log('FIX_DONE');
`;

const b64 = Buffer.from(remote).toString("base64");
const c = new Client();
c.on("ready", () => {
  c.exec(`echo '${b64}' | base64 -d > /tmp/_fix_gg88qt_admin2.mjs && node /tmp/_fix_gg88qt_admin2.mjs`, (e, s) => {
    let o = "", err = "";
    s.on("data", (d) => (o += d));
    s.stderr.on("data", (d) => (err += d));
    s.on("close", (code) => {
      console.log(o);
      if (err) console.error("STDERR", err.slice(0, 3000));
      c.end();
      process.exit(code || 0);
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
