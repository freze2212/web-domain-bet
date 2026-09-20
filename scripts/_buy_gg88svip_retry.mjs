/**
 * Retry buy gg88svip.co via VPS localhost API (server.js/app.js already deployed).
 */
import { Client } from "ssh2";
import fs from "fs";

const DOMAIN = "gg88svip.co";
const LINK = "https://www.gg8830.com/home/register?id=585023986";
const TEMPLATE_ID = "lp_gg88_vip_2";

const buyScript = `process.chdir('/var/www/web-ten-mien');
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

// detect port from pm2 / env
const port = process.env.PORT || '3080';
const urls = [
  'http://127.0.0.1:' + port + '/api/deploy-lp',
  'http://127.0.0.1:3080/api/deploy-lp',
  'http://127.0.0.1:3000/api/deploy-lp',
  'http://127.0.0.1:8787/api/deploy-lp',
];
const body = JSON.stringify({
  domain: '${DOMAIN}',
  link: '${LINK}',
  tele: '${LINK}',
  templateId: '${TEMPLATE_ID}',
  isBuy: true,
});
let lastErr = '';
for (const url of urls) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body,
      signal: AbortSignal.timeout(300000),
    });
    const text = await res.text();
    console.log('URL', url);
    console.log('HTTP', res.status);
    console.log(text.slice(0, 5000));
    process.exit(0);
  } catch (e) {
    lastErr = url + ' -> ' + e.message;
    console.log('try fail', lastErr);
  }
}
console.log('ALL_FAIL', lastErr);
process.exit(1);
`;

const c = new Client();
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
    await new Promise((resolve, reject) => {
      const ws = sftp.createWriteStream("/tmp/_buy_gg88svip.mjs");
      ws.on("close", resolve);
      ws.on("error", reject);
      ws.end(Buffer.from(buyScript, "utf8"));
    });
    console.log("wrote buy script");
    // find listening port
    const info = await exec("pm2 show web-tenmienbet | head -40; ss -tlnp | grep -E 'node|3080|3000' | head -20");
    console.log(info.o.slice(0, 2000));
    const r2 = await exec("node /tmp/_buy_gg88svip.mjs");
    console.log("--- BUY ---");
    console.log(r2.o.slice(0, 6000));
    console.log("exit", r2.code);
    c.end();
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
