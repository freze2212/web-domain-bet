import { Client } from "ssh2";

const remote = `
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
console.log(token);
`;
const b64 = Buffer.from(remote).toString("base64");
const c = new Client();
c.on("ready", () => {
  c.exec(`echo '${b64}' | base64 -d > /tmp/_mint_jwt.mjs && node /tmp/_mint_jwt.mjs`, (e, s) => {
    let o = "", err = "";
    s.on("data", (d) => (o += d));
    s.stderr.on("data", (d) => (err += d));
    s.on("close", (code) => {
      if (code) console.error(err);
      console.log(o.trim());
      c.end();
      process.exit(code || 0);
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
