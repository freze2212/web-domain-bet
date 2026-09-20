import { Client } from "ssh2";

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
console.log('tong88vip hits', JSON.stringify(hits.map(d => ({ domain: d.domain, templateName: d.templateName, cfAccount: d.cfAccount, inRepo: d.inRepo, sourceType: d.sourceType })), null, 2));
`;

const c = new Client();
c.on("ready", () => {
  c.sftp((err, sftp) => {
    const ws = sftp.createWriteStream("/tmp/_test_domains_list.mjs");
    ws.on("close", () => {
      c.exec(
        "pm2 restart web-tenmienbet --update-env && sleep 3 && node /tmp/_test_domains_list.mjs",
        (e2, st) => {
          let o = "";
          st.on("data", (d) => (o += d));
          st.stderr.on("data", (d) => (o += d));
          st.on("close", (code) => {
            console.log(o.slice(0, 4000));
            console.log("exit", code);
            c.end();
          });
        }
      );
    });
    ws.end(Buffer.from(test, "utf8"));
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
