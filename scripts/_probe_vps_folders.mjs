import { Client } from "ssh2";

const c = new Client();
const remote = `
const fs=require('fs');
const path=require('path');
const paths=[
 '/var/www/Landingpages/GG88/ldpape_4d/domains.json',
 '/var/www/Landingpages/GG88/ldpape_4d-5-quocgia/domains.json',
 '/var/www/Landingpages/GG88/ldpape_4d-5-quocgia.bak-20260910191922/domains.json',
 '/var/www/Landingpages/MM88/landingpage-5uae-mm88/domains.json'
];
const d='autotest-6888.top';
function linkOf(e){if(!e)return '';if(typeof e==='string')return e;return e.main_url||e.url||e.link||'';}
for(const p of paths){
  if(!fs.existsSync(p)){console.log(JSON.stringify({p,exists:false}));continue;}
  const j=JSON.parse(fs.readFileSync(p,'utf8'));
  const link=linkOf(j[d]||j['www.'+d]);
  const git=fs.existsSync(path.join(path.dirname(p),'.git'));
  console.log(JSON.stringify({p,exists:true,hasGit:git,link,hasEntry:!!(j[d]||j['www.'+d])}));
}
`;
const b64 = Buffer.from(remote).toString("base64");
c.on("ready", () => {
  c.exec(`echo '${b64}' | base64 -d | node`, (err, stream) => {
    if (err) throw err;
    let out = "";
    stream.on("data", (d) => (out += d));
    stream.stderr.on("data", (d) => process.stderr.write(d));
    stream.on("close", () => {
      console.log(out);
      c.end();
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!", readyTimeout: 20000 });
