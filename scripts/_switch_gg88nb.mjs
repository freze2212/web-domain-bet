import { Client } from "ssh2";

const remote = `process.chdir('/var/www/web-ten-mien');
import fs from 'fs';
for (const line of fs.readFileSync('.env','utf8').split('\\n')) {
  const t=line.trim(); if(!t||t.startsWith('#')||!t.includes('=')) continue;
  const i=t.indexOf('='); const k=t.slice(0,i).trim(); const v=t.slice(i+1).trim();
  if(!(k in process.env)) process.env[k]=v;
}
const auth = await import('file:///var/www/web-ten-mien/src/auth.js');
const u = auth.loadUsers().find(x => x.username === 'admin');
const token = auth.signJwt({ userId: u.id, username: u.username, fullName: u.fullName, role: u.role });
const res = await fetch('http://127.0.0.1:3000/api/switch-template', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
  body: JSON.stringify({
    domain: 'gg88nb.com',
    targetTemplateId: 'lp_gg88_cong_gg88k',
    newLink: 'https://www.gg8842.com/?id=299986220',
    newTele: 'https://www.gg8842.com/?id=299986220',
  }),
  signal: AbortSignal.timeout(300000),
});
console.log('HTTP', res.status);
console.log((await res.text()).slice(0, 6000));

try {
  const { getDomainInfo } = await import('file:///var/www/web-ten-mien/src/spaceship.js');
  const info = await getDomainInfo('gg88svip.co');
  console.log('svip NS', JSON.stringify(info.nameservers));
} catch (e) { console.log('svip info', e.message); }

try {
  const { findZoneByName } = await import('file:///var/www/web-ten-mien/src/cloudflare.js');
  const z = await findZoneByName('gg88svip.co');
  console.log('svip zone', z?.id, z?.status, z?.name_servers);
} catch (e) { console.log('zone', e.message); }

for (const host of ['gg88nb.com', 'www.gg88nb.com']) {
  try {
    const r = await fetch('https://' + host + '/domains.json?v=' + Date.now(), { signal: AbortSignal.timeout(20000) });
    const j = r.ok ? await r.json() : null;
    const apex = 'gg88nb.com';
    const e = j && (j[host] || j[apex] || j['www.' + apex]);
    const link = typeof e === 'string' ? e : (e?.main_url || e?.url || e?.link || '');
    console.log('probe', host, r.status, link);
  } catch (e) { console.log('probe', host, e.message); }
}
`;

const c = new Client();
c.on("ready", () => {
  c.sftp((err, sftp) => {
    if (err) throw err;
    const ws = sftp.createWriteStream("/tmp/_switch_nb.mjs");
    ws.on("close", () => {
      c.exec("node /tmp/_switch_nb.mjs", (e2, st) => {
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
