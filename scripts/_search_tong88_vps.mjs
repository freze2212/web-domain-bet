import { Client } from "ssh2";

const remote = `process.chdir('/var/www/web-ten-mien');
import fs from 'fs';
for (const line of fs.readFileSync('.env','utf8').split('\\n')) {
  const t=line.trim(); if(!t||t.startsWith('#')||!t.includes('=')) continue;
  const i=t.indexOf('='); const k=t.slice(0,i).trim(); const v=t.slice(i+1).trim();
  if(!(k in process.env)) process.env[k]=v;
}
const auth = await import('file:///var/www/web-ten-mien/src/auth.js');
const guard = await import('file:///var/www/web-ten-mien/src/cf-account-guard.js');
const u = auth.loadUsers().find(x => x.username === 'admin');
const token = auth.signJwt({ userId: u.id, username: u.username, fullName: u.fullName, role: u.role });

const zones = guard.listHubZonesFromCache({ includeAdmin: true });
const hits = zones.filter(z => String(z.name).includes('tong88vip'));
console.log('hub zones total', zones.length, 'tong88vip in listHubZones', hits);

for (const q of ['tong88vip.com', 'tong88vip', 'tong88']) {
  const res = await fetch('http://127.0.0.1:3000/api/domains/search?q=' + encodeURIComponent(q), {
    headers: { Authorization: 'Bearer ' + token },
  });
  const j = await res.json();
  console.log('search q='+q, 'HTTP', res.status, 'count', j.count, 'results', (j.results||[]).map(r => r.domain + '/' + r.cfAccount + '/' + r.status));
}
`;

const c = new Client();
c.on("ready", () => {
  c.sftp((err, sftp) => {
    const ws = sftp.createWriteStream("/tmp/_search_tong88.mjs");
    ws.on("close", () => {
      c.exec("node /tmp/_search_tong88.mjs", (e2, st) => {
        let o = "";
        st.on("data", (d) => (o += d));
        st.stderr.on("data", (d) => (o += d));
        st.on("close", (code) => {
          console.log(o);
          console.log("exit", code);
          c.end();
        });
      });
    });
    ws.end(Buffer.from(remote, "utf8"));
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
