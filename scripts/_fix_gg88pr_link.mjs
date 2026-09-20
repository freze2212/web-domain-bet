import { Client } from "ssh2";
import fs from "fs";
import path from "path";

const root = "c:/FREZE-PRJ/web-tên-miền";
const files = ["src/lp-link-patch.js", "src/templates.js", "src/github.js", "src/verifier.js", "src/repo-scanner.js"];

const remoteFix = `
process.chdir('/var/www/web-ten-mien');
import fs from 'fs';
for (const line of fs.readFileSync('.env','utf8').split('\\n')) {
  const t=line.trim(); if(!t||t.startsWith('#')||!t.includes('=')) continue;
  const i=t.indexOf('='); const k=t.slice(0,i).trim(); const v=t.slice(i+1).trim();
  if(!(k in process.env)) process.env[k]=v;
}
const { smartSetLink } = await import('file:///var/www/web-ten-mien/src/repo-scanner.js');
const { addPagesDomain } = await import('file:///var/www/web-ten-mien/src/cloudflare.js');
const link = 'https://gg8826.com/?id=560671221';
const domain = 'gg88pr.com';
console.log('=== Add www to Pages ===');
try {
  const wwwRes = await addPagesDomain('www.'+domain, 'lp-gg88pr-git2', '/var/www/Landingpages/GG88/lp-gg88pr');
  console.log('www pages', JSON.stringify(wwwRes));
} catch (e) { console.log('www pages err', e.message); }
console.log('=== Fix gg88pr.com link ===');
const res = await smartSetLink(domain, link, link, { userId: 'admin', username: 'admin', fullName: 'Admin' });
console.log(JSON.stringify({ success: res.success, verified: res.verified, error: res.error, templateId: res.templateId, liveLink: res.liveLink, cnameTarget: res.cnameTarget, message: res.message }, null, 2));
for (const host of [domain, 'www.'+domain]) {
  try {
    const r = await fetch('https://'+host+'/domains.json?v='+Date.now(), { signal: AbortSignal.timeout(20000) });
    const j = await r.json();
    const e = j[domain] || j['www.'+domain];
    console.log('probe', host, r.status, e?.main_url || e);
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
    await putBuf(sftp, Buffer.from(remoteFix, "utf8"), "/tmp/_fix_gg88pr_link.mjs");
    const r1 = await exec("pm2 restart web-tenmienbet --update-env");
    console.log(r1.o.trim().slice(0, 200));
    await new Promise((r) => setTimeout(r, 4000));
    const r2 = await exec("node /tmp/_fix_gg88pr_link.mjs");
    console.log(r2.o.slice(0, 8000));
    console.log("exit", r2.code);
    c.end();
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
