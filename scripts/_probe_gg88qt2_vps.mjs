import { Client } from "ssh2";

const script = `
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

process.chdir('/var/www/web-ten-mien');
for (const line of fs.readFileSync('.env','utf8').split('\\n')) {
  const t=line.trim(); if(!t||t.startsWith('#')||!t.includes('=')) continue;
  const i=t.indexOf('='); const k=t.slice(0,i).trim(); let v=t.slice(i+1).trim();
  if ((v.startsWith('\"')&&v.endsWith('\"'))||(v.startsWith(\"'\")&&v.endsWith(\"'\"))) v=v.slice(1,-1);
  if(!(k in process.env)) process.env[k]=v;
}

const cf = await import('file:///var/www/web-ten-mien/src/cloudflare.js');

// DNS records in CF zone
try {
  const zone = await cf.getZone('gg88qt.com');
  console.log('ZONE', zone?.id, zone?.status, zone?.name);
  if (zone) {
    const recs = await cf.cfRequest('/zones/'+zone.id+'/dns_records?per_page=100');
    const interesting = (recs||[]).filter(r => ['CNAME','A','AAAA'].includes(r.type) && (r.name==='gg88qt.com'||r.name==='www.gg88qt.com'||r.name.startsWith('www.')));
    console.log('DNS', JSON.stringify(interesting.map(r=>({type:r.type,name:r.name,content:r.content,proxied:r.proxied})),null,2));
  }
} catch(e) { console.log('zone err', e.message); }

// Find which Pages projects have this custom domain
try {
  // reuse internal helpers if exported
  const mods = Object.keys(cf);
  console.log('cf exports sample', mods.filter(m=>/pages|domain|Project/i.test(m)).slice(0,30));
} catch {}

// Check VIP + 5uae domains.json key counts and whether live mismatch
const paths = [
  '/var/www/Landingpages/GG88/ldpape_4d/domains.json',
  '/var/www/Landingpages/GG88/ldpape_4d-5-quocgia/domains.json',
];
for (const p of paths) {
  const j=JSON.parse(fs.readFileSync(p,'utf8'));
  console.log('DISK', p, 'keys', Object.keys(j).length, 'gg88qt', !!j['gg88qt.com'], 'autotest', !!j['autotest-6888.top']);
  try {
    const cwd=path.dirname(p);
    if (fs.existsSync(path.join(cwd,'.git'))) {
      const rem = execSync('git remote -v',{cwd,encoding:'utf8'}).trim().split('\\n')[0];
      const log = execSync('git log -3 --oneline -- domains.json',{cwd,encoding:'utf8'}).trim();
      console.log('GIT', rem);
      console.log('LOG', log);
    }
  } catch(e){ console.log('git', e.message); }
}

// Tiny domains.json search
function walk(dir, depth=0) {
  if (depth>4) return;
  let ents=[]; try{ents=fs.readdirSync(dir,{withFileTypes:true});}catch{return;}
  for (const e of ents) {
    if (e.name==='.git'||e.name==='node_modules') continue;
    const p=path.join(dir,e.name);
    if (e.isDirectory()) {
      if (String(e.name).includes('.bak')||String(e.name).includes('wrong')) continue;
      walk(p, depth+1);
    } else if (e.name==='domains.json') {
      try {
        const j=JSON.parse(fs.readFileSync(p,'utf8'));
        const keys=Object.keys(j);
        if (keys.length <= 5) console.log('TINY', p, keys);
      } catch {}
    }
  }
}
walk('/var/www/Landingpages/GG88');
`;

const b64 = Buffer.from(script).toString("base64");
const c = new Client();
c.on("ready", () => {
  c.exec(`echo '${b64}' | base64 -d > /tmp/_probe_gg88qt2.mjs && node /tmp/_probe_gg88qt2.mjs`, (e, s) => {
    let o = "", err = "";
    s.on("data", (d) => (o += d));
    s.stderr.on("data", (d) => (err += d));
    s.on("close", (code) => {
      console.log(o);
      if (err) console.error("STDERR", err.slice(0, 2000));
      c.end();
      process.exit(0);
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
