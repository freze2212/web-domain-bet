import { Client } from "ssh2";
import fs from "fs";
import path from "path";

const root = "c:/FREZE-PRJ/web-tên-miền";
const files = ["src/cloudflare.js", "src/server.js"];

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
    domain: 'tong88vip.com',
    targetTemplateId: 'lp_gg88_vip_2',
    newLink: 'https://www.gg8853.com/?id=694693940',
    newTele: 'https://www.gg8853.com/?id=694693940',
  }),
  signal: AbortSignal.timeout(360000),
});
console.log('HTTP', res.status);
console.log((await res.text()).slice(0, 4000));

for (const host of ['tong88vip.com', 'www.tong88vip.com']) {
  try {
    const r = await fetch('https://' + host + '/domains.json?v=' + Date.now(), { signal: AbortSignal.timeout(20000), redirect: 'follow' });
    const t = await r.text();
    let link = '';
    try {
      const j = JSON.parse(t);
      const e = j[host] || j['tong88vip.com'] || j['www.tong88vip.com'];
      link = typeof e === 'string' ? e : (e?.main_url || '');
    } catch { link = 'not-json ' + t.slice(0, 120); }
    console.log('probe', host, r.status, link);
  } catch (e) { console.log('probe', host, e.message); }
}
`;

const c = new Client();
function putFile(sftp, local, remotePath) {
  return new Promise((resolve, reject) => {
    const ws = sftp.createWriteStream(remotePath);
    ws.on("close", resolve);
    ws.on("error", reject);
    ws.end(fs.readFileSync(local));
  });
}
function putBuf(sftp, buf, remotePath) {
  return new Promise((resolve, reject) => {
    const ws = sftp.createWriteStream(remotePath);
    ws.on("close", resolve);
    ws.on("error", reject);
    ws.end(buf);
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

c.on("ready", () => {
  c.sftp(async (err, sftp) => {
    if (err) throw err;
    for (const rel of files) {
      await putFile(sftp, path.join(root, rel), `/var/www/web-ten-mien/${rel}`);
      console.log("OK", rel);
    }
    await putBuf(sftp, Buffer.from(remote, "utf8"), "/tmp/_fix_tong88.mjs");
    const r1 = await exec("pm2 restart web-tenmienbet --update-env");
    console.log(r1.o.trim().slice(0, 250));
    await new Promise((r) => setTimeout(r, 3500));
    const r2 = await exec("node /tmp/_fix_tong88.mjs");
    console.log(r2.o.slice(0, 8000));
    console.log("exit", r2.code);
    c.end();
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
