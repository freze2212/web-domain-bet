import { Client } from "ssh2";
const remote = `
process.chdir('/var/www/web-ten-mien');
import fs from 'fs';
for (const line of fs.readFileSync('.env','utf8').split('\\n')) {
  const t=line.trim(); if(!t||t.startsWith('#')||!t.includes('=')) continue;
  const i=t.indexOf('='); process.env[t.slice(0,i).trim()]=t.slice(i+1).trim();
}
const tok=process.env.GITHUB_TOKEN;
const owner='freze2212', repo='lp-gg88pr', branch='main';
async function gh(path) {
  const r=await fetch('https://api.github.com/repos/'+owner+'/'+repo+'/contents/'+encodeURIComponent(path)+'?ref='+branch,{
    headers:{Authorization:'Bearer '+tok,Accept:'application/vnd.github+json','User-Agent':'hub'}
  });
  if(!r.ok) return null;
  const j=await r.json();
  if(j.type==='file') return Buffer.from(j.content,'base64').toString('utf8');
  return j;
}
for (const f of ['index.html','domains.json','js/config.js','config.js','js/dev.js','assets/js/config.js']) {
  const txt = await gh(f);
  if(!txt || typeof txt !== 'string') { console.log(f, 'MISSING'); continue; }
  const hits=[...new Set((txt.match(/gg88[0-9]+\\.com[^"'\\s]*/gi)||[]))];
  console.log('---', f, 'hits', hits);
  if (txt.includes('defaultLink')) {
    const m=txt.match(/defaultLink[^\\n]{0,120}/);
    console.log(' defaultLink line', m?m[0]:'?');
  }
}
`;

const c = new Client();
c.on("ready", () => {
  c.sftp((err, sftp) => {
    const ws = sftp.createWriteStream("/tmp/_gh_gg88pr.mjs");
    ws.on("close", () => {
      c.exec("node /tmp/_gh_gg88pr.mjs", (e2, st) => {
        let o = "";
        st.on("data", (d) => (o += d));
        st.stderr.on("data", (d) => (o += d));
        st.on("close", () => {
          console.log(o);
          c.end();
        });
      });
    });
    ws.end(remote);
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
