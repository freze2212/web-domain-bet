import { Client } from "ssh2";
import fs from "node:fs";

let localAdmin = "";
let localAdminAcc = "ddead9accc534c1eb074d2a46fffe748";
for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
  const t = line.trim();
  if (t.startsWith("CLOUDFLARE_ADMIN_API_TOKEN=")) localAdmin = t.slice("CLOUDFLARE_ADMIN_API_TOKEN=".length).trim();
  if (t.startsWith("CLOUDFLARE_ADMIN_ACCOUNT_ID=")) localAdminAcc = t.slice("CLOUDFLARE_ADMIN_ACCOUNT_ID=".length).trim();
}

if (!localAdmin) {
  console.error("Local .env missing CLOUDFLARE_ADMIN_API_TOKEN");
  process.exit(1);
}

const payload = Buffer.from(
  JSON.stringify({
    CLOUDFLARE_ADMIN_API_TOKEN: localAdmin,
    CLOUDFLARE_ADMIN_ACCOUNT_ID: localAdminAcc,
  })
).toString("base64");

const remote = `
set -e
cd /var/www/web-ten-mien
echo '${payload}' | base64 -d > /tmp/_admin_env.json
node --input-type=module <<'NODE'
import fs from 'fs';
const kv = JSON.parse(fs.readFileSync('/tmp/_admin_env.json','utf8'));
const path = '.env';
let lines = fs.readFileSync(path,'utf8').split(/\\r?\\n/);
const seen = new Set();
lines = lines.map((line) => {
  const t = line.trim();
  if (!t || t.startsWith('#') || !t.includes('=')) return line;
  const i = t.indexOf('=');
  const k = t.slice(0,i).trim();
  if (k in kv) {
    seen.add(k);
    return k + '=' + kv[k];
  }
  return line;
});
for (const [k,v] of Object.entries(kv)) {
  if (!seen.has(k)) lines.push(k + '=' + v);
}
fs.writeFileSync(path, lines.filter((l, idx, arr) => !(l==='' && idx===arr.length-1)).join('\\n').replace(/\\n+$/,'') + '\\n');
console.log('upserted', Object.keys(kv).join(','));
console.log('hasToken', /CLOUDFLARE_ADMIN_API_TOKEN=.+/.test(fs.readFileSync(path,'utf8')));
NODE
rm -f /tmp/_admin_env.json
pm2 restart web-tenmienbet --update-env
sleep 2
node --input-type=module <<'NODE'
import fs from 'fs';
for (const line of fs.readFileSync('.env','utf8').split(/\\n/)) {
  const t=line.trim(); if(!t||t.startsWith('#')||!t.includes('=')) continue;
  const i=t.indexOf('='); const k=t.slice(0,i).trim(); const v=t.slice(i+1).trim();
  if(!(k in process.env)) process.env[k]=v;
}
console.log('tokenLen', (process.env.CLOUDFLARE_ADMIN_API_TOKEN||'').length);
const g=await import('./src/cf-account-guard.js');
console.log(JSON.stringify(g.resolveCfZoneOwnership('ll886.us')));
const m=await import('./src/repo-scanner.js');
const all=m.listAllDomains();
const hit=all.find(d=>d.domain==='ll886.us');
console.log('count', all.length, 'll886', hit ? hit.primaryFolder : false);
NODE
`;

const c = new Client();
c.on("ready", () => {
  c.exec(remote, (e, s) => {
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
