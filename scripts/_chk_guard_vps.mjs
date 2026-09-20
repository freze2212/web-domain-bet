import { Client } from "ssh2";
const remote = `
import fs from 'fs';
const p='/var/www/web-ten-mien/data/cf_zones_cache.json';
if(!fs.existsSync(p)){ console.log('NO_CACHE'); process.exit(0); }
const z=JSON.parse(fs.readFileSync(p,'utf8'));
const a=z.filter(x=>String(x.accountName||'').includes('Admin@itkjc'));
console.log('zones',z.length,'admin',a.length);
console.log('gg86', JSON.stringify(z.filter(x=>x.name==='gg86.us')));
const g=await import('file:///var/www/web-ten-mien/src/cf-account-guard.js');
console.log('guard gg86', g.adminSkipPayload('gg86.us')?.code);
console.log('guard autotest', g.adminSkipPayload('autotest-6888.top')?.code||'allow');
`;
const b64 = Buffer.from(remote).toString("base64");
const c = new Client();
c.on("ready", () => {
  c.exec(`echo '${b64}' | base64 -d > /tmp/_chk_guard.mjs && node /tmp/_chk_guard.mjs`, (e, s) => {
    let o = "";
    s.on("data", (d) => (o += d));
    s.stderr.on("data", (d) => (o += d));
    s.on("close", () => {
      console.log(o);
      c.end();
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
