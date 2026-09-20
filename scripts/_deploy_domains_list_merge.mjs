import { Client } from "ssh2";
import fs from "fs";
import path from "path";

const root = "c:/FREZE-PRJ/web-tên-miền";
const files = [
  "src/server.js",
  "scripts/sync_all_cf_zones.js",
  "public/app.js",
  "public/index.html",
];

const c = new Client();
function put(sftp, local, remote) {
  return new Promise((resolve, reject) => {
    const ws = sftp.createWriteStream(remote);
    ws.on("close", resolve);
    ws.on("error", reject);
    ws.end(fs.readFileSync(local));
  });
}
function exec(cmd) {
  return new Promise((resolve, reject) => {
    c.exec(cmd, (err, st) => {
      if (err) return reject(err);
      let o = "";
      st.on("data", (d) => (o += d));
      st.stderr.on("data", (d) => (o += d));
      st.on("close", (code) => resolve({ code, o }));
    });
  });
}

const test = `process.chdir('/var/www/web-ten-mien');
import fs from 'fs';
for (const line of fs.readFileSync('.env','utf8').split('\\n')) {
  const t=line.trim(); if(!t||t.startsWith('#')||!t.includes('=')) continue;
  const i=t.indexOf('='); const k=t.slice(0,i).trim(); const v=t.slice(i+1).trim();
  if(!(k in process.env)) process.env[k]=v;
}
const auth = await import('file:///var/www/web-ten-mien/src/auth.js');
const u = auth.loadUsers().find(x => x.username === 'admin');
const token = auth.signJwt({ userId: u.id, username: u.username, fullName: u.fullName, role: u.role });
const res = await fetch('http://127.0.0.1:3000/api/domains-list', { headers: { Authorization: 'Bearer ' + token } });
const j = await res.json();
const hits = (j.domains||[]).filter(d => String(d.domain).includes('tong88vip'));
console.log('HTTP', res.status, 'total', j.count, 'cfZonesMerged', j.cfZonesMerged);
console.log('tong88vip hits', hits.map(d => ({ domain: d.domain, templateName: d.templateName, cfAccount: d.cfAccount, inRepo: d.inRepo, sourceType: d.sourceType })));
`;

c.on("ready", () => {
  c.sftp(async (err, sftp) => {
    if (err) throw err;
    for (const rel of files) {
      await put(sftp, path.join(root, rel), `/var/www/web-ten-mien/${rel}`);
      console.log("OK", rel);
    }
    await put(sftp, Buffer.from(test, "utf8"), "/tmp/_test_domains_list.mjs");
    const r1 = await exec("pm2 restart web-tenmienbet --update-env");
    console.log(r1.o.trim().slice(0, 300));
    await new Promise((r) => setTimeout(r, 3000));
    const r2 = await exec("node /tmp/_test_domains_list.mjs");
    console.log(r2.o);
    c.end();
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
