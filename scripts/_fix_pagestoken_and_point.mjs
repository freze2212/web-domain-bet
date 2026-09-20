/**
 * Deploy cloudflare.js fix + point LP gg88svip.co + retry switch gg88nb.com
 */
import { Client } from "ssh2";
import fs from "fs";
import path from "path";

const root = "c:/FREZE-PRJ/web-tên-miền";
const files = ["src/cloudflare.js", "src/server.js", "public/app.js"];

const c = new Client();
function put(sftp, local, remote) {
  return new Promise((resolve, reject) => {
    const ws = sftp.createWriteStream(remote);
    ws.on("close", resolve);
    ws.on("error", reject);
    ws.end(typeof local === "string" && fs.existsSync(local) ? fs.readFileSync(local) : local);
  });
}
function exec(cmd, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    c.exec(cmd, { maxBuffer: 10 * 1024 * 1024 }, (err, st) => {
      if (err) return reject(err);
      let o = "";
      st.on("data", (d) => (o += d));
      st.stderr.on("data", (d) => (o += d));
      st.on("close", (code) => resolve({ code, o }));
    });
  });
}

const remoteWork = `
process.chdir('/var/www/web-ten-mien');
import fs from 'fs';
for (const line of fs.readFileSync('.env','utf8').split('\\n')) {
  const t=line.trim(); if(!t||t.startsWith('#')||!t.includes('=')) continue;
  const i=t.indexOf('='); const k=t.slice(0,i).trim(); const v=t.slice(i+1).trim();
  if(!(k in process.env)) process.env[k]=v;
}
const auth = await import('file:///var/www/web-ten-mien/src/auth.js');
const users = auth.loadUsers();
const u = users.find(x => x.username === 'admin');
const token = auth.signJwt({ userId: u.id, username: u.username, fullName: u.fullName, role: u.role });
const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token };

async function post(url, body) {
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(300000) });
  const text = await res.text();
  console.log('HTTP', res.status, url);
  console.log(text.slice(0, 3500));
  return { status: res.status, text };
}

const base = 'http://127.0.0.1:3000';

console.log('=== 1) POINT LP gg88svip.co (isBuy:false) ===');
await post(base + '/api/deploy-lp', {
  domain: 'gg88svip.co',
  link: 'https://www.gg8830.com/home/register?id=585023986',
  tele: 'https://www.gg8830.com/home/register?id=585023986',
  templateId: 'lp_gg88_vip_2',
  isBuy: false,
});

console.log('=== 2) SWITCH TEMPLATE gg88nb.com → cong-gg88k ===');
await post(base + '/api/switch-template', {
  domain: 'gg88nb.com',
  templateId: 'lp_gg88_cong_gg88k',
  link: 'https://www.gg8842.com/?id=299986220',
  tele: 'https://www.gg8842.com/?id=299986220',
});

console.log('=== 3) quick probe ===');
for (const host of ['www.gg88svip.co', 'gg88svip.co', 'gg88nb.com']) {
  try {
    const r = await fetch('https://' + host + '/domains.json?v=' + Date.now(), { signal: AbortSignal.timeout(20000) });
    const t = await r.text();
    let link = '';
    try {
      const j = JSON.parse(t);
      const apex = host.replace(/^www\\./,'');
      const e = j[host] || j[apex] || j['www.'+apex];
      link = typeof e === 'string' ? e : (e?.main_url || e?.url || e?.link || '');
    } catch { link = 'not-json:' + t.slice(0,80); }
    console.log('probe', host, r.status, link);
  } catch (e) {
    console.log('probe', host, e.message);
  }
}
`;

c.on("ready", () => {
  c.sftp(async (err, sftp) => {
    if (err) throw err;
    for (const rel of files) {
      const local = path.join(root, rel);
      if (!fs.existsSync(local)) {
        console.log("skip missing", rel);
        continue;
      }
      await put(sftp, local, `/var/www/web-ten-mien/${rel}`);
      console.log("OK", rel);
    }
    await put(sftp, Buffer.from(remoteWork, "utf8"), "/tmp/_fix_and_point.mjs");
    const r1 = await exec("pm2 restart web-tenmienbet --update-env");
    console.log(r1.o.trim().slice(0, 400));
    await new Promise((r) => setTimeout(r, 3000));
    const r2 = await exec("node /tmp/_fix_and_point.mjs");
    console.log(r2.o.slice(0, 12000));
    console.log("exit", r2.code);
    c.end();
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
