import { Client } from "ssh2";

const remote = `
process.chdir('/var/www/web-ten-mien');
const fs = await import('fs');
const z = JSON.parse(fs.readFileSync('data/cf_zones_cache.json','utf8'));
console.log('cache total', z.length);
console.log('ll886 cache', z.find(x => x.name === 'll886.us'));
console.log('admin token?', Boolean(process.env.CLOUDFLARE_ADMIN_API_TOKEN));
// load env like app
for (const line of fs.readFileSync('.env','utf8').split('\\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#') || !t.includes('=')) continue;
  const i = t.indexOf('=');
  const k = t.slice(0,i).trim();
  const v = t.slice(i+1).trim();
  if (!(k in process.env)) process.env[k] = v;
}
console.log('admin token after env', Boolean(process.env.CLOUDFLARE_ADMIN_API_TOKEN), (process.env.CLOUDFLARE_ADMIN_API_TOKEN||'').slice(0,12));
const g = await import('./src/cf-account-guard.js');
console.log('own', g.resolveCfZoneOwnership('ll886.us'));
console.log('hubDomain?', g.isFrezeHubDomain('ll886.us'));
console.log('admin zones', g.listAdminZonesFromCache().length);
console.log('hub zones', g.listHubZonesFromCache().length);
const m = await import('./src/repo-scanner.js');
const all = m.listAllDomains();
console.log('list', all.length, 'll886', all.find(d => d.domain === 'll886.us'));
`;

const b64 = Buffer.from(remote).toString("base64");
const c = new Client();
c.on("ready", () => {
  c.exec(`echo '${b64}' | base64 -d > /tmp/_dbg_ll886.mjs && node /tmp/_dbg_ll886.mjs`, (e, s) => {
    let o = "";
    s.on("data", (d) => (o += d));
    s.stderr.on("data", (d) => (o += d));
    s.on("close", () => {
      console.log(o);
      c.end();
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
