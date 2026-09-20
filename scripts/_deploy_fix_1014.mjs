import { Client } from "ssh2";
import fs from "node:fs";
import path from "node:path";

const FILES = ["src/cloudflare.js", "src/server.js", "src/repo-scanner.js"];
const host = "103.146.22.218";
const remoteDir = "/var/www/web-ten-mien";

function upload(sftp, localRel) {
  return new Promise((resolve, reject) => {
    const local = path.resolve(localRel);
    const remote = `${remoteDir}/${localRel.replace(/\\/g, "/")}`;
    sftp.fastPut(local, remote, (err) => (err ? reject(err) : resolve(remote)));
  });
}

const repair = `
process.chdir('/var/www/web-ten-mien');
const fs = await import('node:fs');
for (const line of fs.readFileSync('.env','utf8').split('\\n')) {
  const t=line.trim(); if(!t||t.startsWith('#')||!t.includes('=')) continue;
  const i=t.indexOf('='); const k=t.slice(0,i).trim(); const v=t.slice(i+1).trim();
  if(!(k in process.env)) process.env[k]=v;
}
const cf = await import('file:///var/www/web-ten-mien/src/cloudflare.js');
const DOMAIN='ll886.us';
const TARGET='lp-5f-llwin.pages.dev';
console.log('Repair', DOMAIN, '→', TARGET);
// ensure on Pages then CNAME then wait
const pages = await cf.addPagesDomain(DOMAIN, 'lp-5f-llwin');
console.log('pages', pages);
const cname = await cf.ensurePagesCname(DOMAIN, pages.canonicalSubdomain || TARGET);
console.log('cname', cname);
try {
  const w = await cf.waitForPagesDomainActive(pages.projectName || 'lp-5f-llwin', DOMAIN, null, 180000);
  console.log('active', w);
} catch (e) {
  console.log('wait', e.message);
}
const zone = await cf.findZoneByName(DOMAIN);
const recs = await cf.cfRequest('/zones/'+zone.id+'/dns_records?per_page=100', { token: cf.tokenForZone(zone) });
console.log('dns', (recs||[]).filter(r=>r.name===DOMAIN||r.name==='www.'+DOMAIN).map(r=>({t:r.type,c:r.content,p:r.proxied})));
const present = await cf.frezePagesHasDomain(DOMAIN, 'lp-5f-llwin');
console.log('present', present);
`;

const b64 = Buffer.from(repair).toString("base64");
const conn = new Client();
conn
  .on("ready", () => {
    conn.sftp(async (err, sftp) => {
      if (err) {
        console.error(err);
        conn.end();
        process.exit(1);
      }
      for (const f of FILES) {
        console.log("UP", await upload(sftp, f));
      }
      conn.exec(
        `cd ${remoteDir} && pm2 restart web-tenmienbet --update-env && sleep 2 && echo '${b64}' | base64 -d > /tmp/_repair_ll886.mjs && node /tmp/_repair_ll886.mjs`,
        (e2, stream) => {
          stream.on("data", (d) => process.stdout.write(d.toString()));
          stream.stderr.on("data", (d) => process.stderr.write(d.toString()));
          stream.on("close", (code) => {
            conn.end();
            process.exit(code || 0);
          });
        }
      );
    });
  })
  .connect({ host, username: "root", password: "admin123@!" });
