import { Client } from "ssh2";
import { readFileSync } from "fs";

const files = [
  ["src/ownership.js", "/var/www/web-ten-mien/src/ownership.js"],
  ["src/cf-account-guard.js", "/var/www/web-ten-mien/src/cf-account-guard.js"],
  ["src/server.js", "/var/www/web-ten-mien/src/server.js"],
  ["src/app.js", "/var/www/web-ten-mien/src/app.js"],
  ["src/domains-list-service.js", "/var/www/web-ten-mien/src/domains-list-service.js"],
  ["src/repo-scanner.js", "/var/www/web-ten-mien/src/repo-scanner.js"],
  ["public/app.js", "/var/www/web-ten-mien/public/app.js"],
];

const root = "c:/FREZE-PRJ/web-tên-miền/";

const c = new Client();
c.on("ready", () => {
  c.sftp((err, sftp) => {
    if (err) throw err;
    let i = 0;
    const next = () => {
      if (i >= files.length) {
        c.exec(
          `
cd /var/www/web-ten-mien
pm2 restart web-tenmienbet --update-env
sleep 3
node --input-type=module <<'JS'
import { performance } from 'node:perf_hooks';
import { invalidateDomainListCache } from './src/repo-scanner.js';
import { invalidateEnrichedDomainsCache, queryEnrichedDomainsList } from './src/domains-list-service.js';
import { invalidateOwnershipCache } from './src/ownership.js';
import { invalidateCfZoneCacheMem } from './src/cf-account-guard.js';
invalidateDomainListCache();
invalidateEnrichedDomainsCache();
invalidateOwnershipCache();
invalidateCfZoneCacheMem();
const t0=performance.now();
const q1=queryEnrichedDomainsList({isAdminUser:true,userAllowedDomains:null},{page:1,limit:50,q:'gg888qt'});
const t1=performance.now();
const q2=queryEnrichedDomainsList({isAdminUser:true,userAllowedDomains:null},{page:1,limit:50,q:'gg888qt'});
const t2=performance.now();
const q3=queryEnrichedDomainsList({isAdminUser:true,userAllowedDomains:null},{page:1,limit:50,q:'llwinu'});
const t3=performance.now();
console.log('cold_ms', (t1-t0).toFixed(0), 'total', q1.total, 'count', q1.count);
console.log('warm_ms', (t2-t1).toFixed(0));
console.log('search2_ms', (t3-t2).toFixed(0), 'total', q3.total);
JS
pm2 logs web-tenmienbet --lines 15 --nostream | tail -20
`,
          (e2, s) => {
            let o = "";
            s.on("data", (d) => (o += d.toString()));
            s.stderr.on("data", (d) => (o += d.toString()));
            s.on("close", (code) => {
              console.log(o || "(empty)");
              console.log("exit", code);
              c.end();
            });
          }
        );
        return;
      }
      const [local, remote] = files[i++];
      const buf = readFileSync(root + local);
      sftp.writeFile(remote, buf, (e) => {
        if (e) throw e;
        console.log("OK", local);
        next();
      });
    };
    next();
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
