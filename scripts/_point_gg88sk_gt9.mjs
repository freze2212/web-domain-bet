/**
 * Push LP updates + point gg88sk.com → lp_gg88_gt9_sk
 */
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { Client } from "ssh2";

const root = "c:/FREZE-PRJ/web-tên-miền";
for (const line of fs.readFileSync(path.join(root, ".env"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const i = t.indexOf("=");
  process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const GH = process.env.GITHUB_TOKEN;
const LOCAL = path.join(root, "landing-staging/lp-gg88-gt9-sk");
const REPO = "freze2212/lp-gg88-gt9-sk";
const DOMAIN = "gg88sk.com";
const LINK = "https://www.gg8850.com/?id=984093514";
const TEMPLATE = "lp_gg88_gt9_sk";

function pushLpRepo() {
  const remote = `https://${GH}@github.com/${REPO}.git`;
  try {
    execSync("git branch -M main", { cwd: LOCAL, stdio: "inherit" });
  } catch {}
  execSync("git add -A", { cwd: LOCAL, stdio: "inherit" });
  try {
    execSync("git diff --cached --quiet", { cwd: LOCAL });
    console.log("LP: no changes");
  } catch {
    execSync('git commit -m "fix: center CTA, strict domains.json, no fallback"', {
      cwd: LOCAL,
      stdio: "inherit",
    });
  }
  try {
    execSync("git remote get-url origin", { cwd: LOCAL, stdio: "pipe" });
    execSync(`git remote set-url origin ${remote}`, { cwd: LOCAL, stdio: "inherit" });
  } catch {
    execSync(`git remote add origin ${remote}`, { cwd: LOCAL, stdio: "inherit" });
  }
  execSync("git push -u origin main --force", { cwd: LOCAL, stdio: "inherit" });
  console.log("LP git push ok");
}

function sshExec(cmd, timeoutMs = 300000) {
  return new Promise((resolve, reject) => {
    const c = new Client();
    c.on("ready", () => {
      c.exec(cmd, { maxBuffer: 12 * 1024 * 1024 }, (err, stream) => {
        if (err) return reject(err);
        let out = "";
        stream.on("data", (d) => (out += d));
        stream.stderr.on("data", (d) => (out += d));
        stream.on("close", (code) => {
          c.end();
          resolve({ code, out });
        });
      });
    }).on("error", reject).connect({
      host: "103.146.22.218",
      username: "root",
      password: "admin123@!",
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

const LP='/var/www/Landingpages/GG88/lp-gg88-gt9-sk';
if (fs.existsSync(LP+'/.git')) {
  await import('child_process').then(({execSync}) => {
    execSync('git fetch origin && git reset --hard origin/main', {cwd: LP, stdio: 'inherit'});
  });
}

const auth = await import('file:///var/www/web-ten-mien/src/auth.js');
const users = auth.loadUsers();
const u = users.find(x => x.username === 'admin');
const token = auth.signJwt({ userId: u.id, username: u.username, fullName: u.fullName, role: u.role });
const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token };
const base = 'http://127.0.0.1:3000';

async function post(url, body) {
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(300000) });
  const text = await res.text();
  console.log('HTTP', res.status, url);
  console.log(text.slice(0, 5000));
  return { status: res.status, text };
}

console.log('=== POINT LP ${DOMAIN} ===');
await post(base + '/api/deploy-lp', {
  domain: '${DOMAIN}',
  link: '${LINK}',
  tele: '${LINK}',
  templateId: '${TEMPLATE}',
  isBuy: false,
});

console.log('=== PROBE ===');
for (const host of ['${DOMAIN}', 'www.${DOMAIN}']) {
  try {
    const r = await fetch('https://' + host + '/domains.json?v=' + Date.now(), { signal: AbortSignal.timeout(25000) });
    const j = await r.json();
    const e = j[host] || j['${DOMAIN}'];
    const link = typeof e === 'string' ? e : (e?.main_url || '');
    console.log('probe', host, r.status, link, 'defaultLink=' + (j.defaultLink || 'none'));
  } catch (e) {
    console.log('probe', host, e.message);
  }
}
try {
  const r = await fetch('https://${DOMAIN}/', { signal: AbortSignal.timeout(25000), redirect: 'manual' });
  console.log('home', r.status, r.headers.get('server') || '');
} catch (e) {
  console.log('home', e.message);
}
`;

pushLpRepo();

const syncLp = `
set -e
mkdir -p /var/www/Landingpages/GG88
if [ -d /var/www/Landingpages/GG88/lp-gg88-gt9-sk/.git ]; then
  cd /var/www/Landingpages/GG88/lp-gg88-gt9-sk && git fetch origin && git reset --hard origin/main
else
  rm -rf /var/www/Landingpages/GG88/lp-gg88-gt9-sk
  git clone https://${GH}@github.com/${REPO}.git /var/www/Landingpages/GG88/lp-gg88-gt9-sk
  cd /var/www/Landingpages/GG88/lp-gg88-gt9-sk && git checkout main 2>/dev/null || git checkout master
fi
echo SYNC_OK
`;
const r1 = await sshExec(syncLp);
console.log(r1.out.trim());
if (r1.code !== 0) process.exit(1);

await sshExec("cat > /tmp/_point_gg88sk_gt9.mjs <<'EOF'\n" + remoteWork + "\nEOF");
const r2 = await sshExec("node /tmp/_point_gg88sk_gt9.mjs");
console.log(r2.out.slice(0, 15000));
if (r2.code !== 0) process.exit(1);
console.log("DONE");
