import { Client } from "ssh2";
const remote = `
process.chdir('/var/www/web-ten-mien');
import fs from 'fs';
for (const line of fs.readFileSync('.env','utf8').split('\\n')) {
  const t=line.trim(); if(!t||t.startsWith('#')||!t.includes('=')) continue;
  const i=t.indexOf('='); process.env[t.slice(0,i).trim()]=t.slice(i+1).trim();
}
const tok=process.env.GITHUB_TOKEN;
const r=await fetch('https://api.github.com/repos/freze2212/lp-gg88pr/contents/index.html?ref=main',{
  headers:{Authorization:'Bearer '+tok,Accept:'application/vnd.github+json','User-Agent':'hub'}
});
const j=await r.json();
const html=Buffer.from(j.content,'base64').toString('utf8');
console.log('sha', j.sha);
console.log('len', html.length);
const idx=html.indexOf('REDIRECT_URL');
console.log(html.slice(Math.max(0,idx-80), idx+400));
console.log('--- fetch domains ---');
const fi=html.indexOf('domains.json');
console.log(fi>=0? html.slice(Math.max(0,fi-100), fi+500): 'NO domains.json fetch');
`;

const c = new Client();
c.on("ready", () => {
  c.sftp((err, sftp) => {
    const ws = sftp.createWriteStream("/tmp/_gh_idx.mjs");
    ws.on("close", () => {
      c.exec("node /tmp/_gh_idx.mjs", (e2, st) => {
        let o = "";
        st.on("data", (d) => (o += d));
        st.on("close", () => {
          console.log(o);
          c.end();
        });
      });
    });
    ws.end(remote);
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
