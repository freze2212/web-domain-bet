/**
 * VPS-side authenticated QA — mint JWT on server, test all admin APIs
 */
import { Client } from "ssh2";
import fs from "fs";
import path from "path";

const root = "c:/FREZE-PRJ/web-tên-miền";
const OUT = path.join(root, "data", "_QA_VPS_AUTH.json");

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
const admin = users.find(u => u.username === 'admin');
const token = auth.signJwt({ userId: admin.id, username: admin.username, fullName: admin.fullName, role: admin.role });
const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token };
const base = 'http://127.0.0.1:3000';
const results = [];

async function test(id, title, method, path, body) {
  const t0 = Date.now();
  try {
    const res = await fetch(base + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(60000),
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    const ok = res.status >= 200 && res.status < 400;
    results.push({ id, title, ok, status: res.status, ms: Date.now() - t0, sample: text.slice(0, 120) });
  } catch (e) {
    results.push({ id, title, ok: false, status: 0, ms: Date.now() - t0, error: e.message });
  }
}

await test('me', 'GET /api/auth/me', 'GET', '/api/auth/me');
await test('domains', 'GET /api/domains-list', 'GET', '/api/domains-list');
await test('tasks', 'GET /api/tasks', 'GET', '/api/tasks');
await test('history', 'GET /api/history', 'GET', '/api/history');
await test('wallet', 'GET /api/wallet/balance', 'GET', '/api/wallet/balance');
await test('orders', 'GET /api/domain-orders', 'GET', '/api/domain-orders');
await test('perms', 'GET /api/domain-requests', 'GET', '/api/domain-requests');
await test('users', 'GET /api/admin/users', 'GET', '/api/admin/users');
await test('cf', 'GET /api/cf-token', 'GET', '/api/cf-token');
await test('search', 'GET /api/domains/search?q=gg88', 'GET', '/api/domains/search?q=gg88');
await test('resolve', 'GET /api/resolve-link?domain=gg88sk.com', 'GET', '/api/resolve-link?domain=gg88sk.com');
await test('deploy-val', 'POST /api/deploy-lp validate', 'POST', '/api/deploy-lp', { domain: '', link: '', templateId: '' });
await test('deploy-202', 'POST /api/deploy-lp async accept', 'POST', '/api/deploy-lp', {
  domain: 'qa-dry-run-invalid.test',
  link: 'https://example.com',
  templateId: 'lp_gg88_vip_2',
  isBuy: false,
});
await test('switch-val', 'POST /api/switch-template validate', 'POST', '/api/switch-template', {});
await test('setlink-val', 'POST /api/set-link validate', 'POST', '/api/set-link', {});
await test('inspect', 'POST /api/inspect-health', 'POST', '/api/inspect-health', { domain: 'gg88sk.com' });

console.log(JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
`;

const c = new Client();
c.on("ready", () => {
  c.exec(`cat > /tmp/_qa_vps_auth.mjs <<'EOF'\n${remoteWork}\nEOF\nnode /tmp/_qa_vps_auth.mjs`, { maxBuffer: 8 * 1024 * 1024 }, (err, s) => {
    let o = "";
    s.on("data", (d) => (o += d));
    s.stderr.on("data", (d) => (o += d));
    s.on("close", () => {
      const jsonStart = o.indexOf("{");
      if (jsonStart >= 0) {
        const parsed = JSON.parse(o.slice(jsonStart));
        fs.writeFileSync(OUT, JSON.stringify(parsed, null, 2));
        let pass = 0, fail = 0;
        for (const r of parsed.results) {
          console.log((r.ok ? "✅" : "❌") + " " + r.id + " " + r.title + " HTTP " + r.status + " " + r.ms + "ms");
          if (r.ok) pass++; else fail++;
        }
        console.log("VPS AUTH:", pass, "pass", fail, "fail");
      } else {
        console.log(o);
      }
      c.end();
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
