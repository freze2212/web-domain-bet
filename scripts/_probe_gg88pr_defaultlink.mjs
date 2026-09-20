import { Client } from "ssh2";
const cmd = `cd /var/www/web-ten-mien && node --input-type=module -e "
import fs from 'fs';
for (const line of fs.readFileSync('.env','utf8').split('\\n')) {
  const t=line.trim(); if(!t||t.startsWith('#')||!t.includes('=')) continue;
  const i=t.indexOf('='); process.env[t.slice(0,i).trim()]=t.slice(i+1).trim();
}
const tok=process.env.GITHUB_TOKEN;
const r=await fetch('https://api.github.com/repos/freze2212/lp-gg88pr/contents/domains.json?ref=main',{headers:{Authorization:'Bearer '+tok,Accept:'application/vnd.github+json','User-Agent':'hub'}});
const j=await r.json();
const dj=JSON.parse(Buffer.from(j.content,'base64').toString('utf8'));
console.log('defaultLink', dj.defaultLink);
console.log('gg88pr', dj['gg88pr.com']);
for (const f of ['js/config.js','config.js','assets/js/config.js']) {
  try {
    const fr=await fetch('https://api.github.com/repos/freze2212/lp-gg88pr/contents/'+encodeURIComponent(f)+'?ref=main',{headers:{Authorization:'Bearer '+tok,Accept:'application/vnd.github+json','User-Agent':'hub'}});
    if(!fr.ok) continue;
    const fj=await fr.json();
    const txt=Buffer.from(fj.content,'base64').toString('utf8');
    const m=txt.match(/defaultLink[^\\n]{0,120}/);
    console.log('file', f, m?m[0]:'no defaultLink');
    const m2=[...txt.matchAll(/gg8838[^\"'\\s]*/g)].slice(0,3);
    console.log('  gg8838 refs', m2.map(x=>x[0]));
  } catch(e){}
}
"`;
const c = new Client();
c.on("ready", () => {
  c.exec(cmd, (err, st) => {
    let o = "";
    st.on("data", (d) => (o += d));
    st.stderr.on("data", (d) => (o += d));
    st.on("close", () => {
      console.log(o);
      c.end();
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
