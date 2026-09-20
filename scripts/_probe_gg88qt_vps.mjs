import { Client } from "ssh2";

const script = `
const domain = 'gg88qt.com';
import fs from 'fs';
import { execSync } from 'child_process';

// CF CNAME via dig if available
try {
  console.log('DIG:', execSync('dig +short CNAME '+domain+' @1.1.1.1; dig +short CNAME www.'+domain+' @1.1.1.1', {encoding:'utf8'}).trim());
} catch(e) { console.log('dig fail', e.message); }

// ownership
try {
  const o = JSON.parse(fs.readFileSync('/var/www/web-ten-mien/data/ownership.json','utf8'));
  console.log('OWNERSHIP:', JSON.stringify(o[domain] || o[domain.replace(/^www\\./,'')] || null));
} catch(e) { console.log('own err', e.message); }

// history last items
try {
  const h = JSON.parse(fs.readFileSync('/var/www/web-ten-mien/data/history.json','utf8'));
  const list = Array.isArray(h) ? h : (h.history||h.items||[]);
  const hits = list.filter(x => (x.domain||'').includes('gg88qt')).slice(0,8);
  console.log('HISTORY_COUNT', hits.length);
  for (const x of hits.slice(0,5)) console.log(JSON.stringify({id:x.id,action:x.actionType,link:x.link,tpl:x.templateName||x.templateId,cname:x.cnameTarget,status:x.status,at:x.createdAt||x.at}));
} catch(e) { console.log('hist err', e.message); }

// find gg88qt in Landingpages domains.json
const roots = ['/var/www/Landingpages'];
function walk(dir, depth=0) {
  if (depth>5) return;
  let ents=[];
  try { ents=fs.readdirSync(dir,{withFileTypes:true}); } catch { return; }
  for (const e of ents) {
    if (e.name==='.git'||e.name==='node_modules'||e.name.startsWith('.')) continue;
    const p=dir+'/'+e.name;
    if (e.isDirectory()) {
      if (e.name.includes('.bak')||e.name.includes('wrong-')) continue;
      walk(p, depth+1);
    } else if (e.name==='domains.json') {
      try {
        const j=JSON.parse(fs.readFileSync(p,'utf8'));
        if (domain in j || ('www.'+domain) in j) {
          const entry=j[domain]||j['www.'+domain];
          const keys=Object.keys(j).length;
          console.log('FOUND', p, 'keys', keys, 'entry', JSON.stringify(entry).slice(0,120));
        }
        // also flag tiny files that only have autotest
        const keys=Object.keys(j);
        if (keys.length<=4 && keys.some(k=>k.includes('autotest'))) {
          console.log('TINY_AUTOTEST', p, keys);
        }
      } catch {}
    }
  }
}
walk('/var/www/Landingpages');
`;

const b64 = Buffer.from(script).toString("base64");
const c = new Client();
c.on("ready", () => {
  c.exec(`echo '${b64}' | base64 -d > /tmp/_probe_gg88qt.mjs && node /tmp/_probe_gg88qt.mjs`, (e, s) => {
    let o = "", err = "";
    s.on("data", (d) => (o += d));
    s.stderr.on("data", (d) => (err += d));
    s.on("close", (code) => {
      console.log(o);
      if (err) console.error(err);
      c.end();
      process.exit(code || 0);
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
