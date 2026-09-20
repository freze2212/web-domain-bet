import { Client } from "ssh2";

const script = `
import fs from 'fs';
process.chdir('/var/www/web-ten-mien');
for (const line of fs.readFileSync('.env','utf8').split('\\n')) {
  const t=line.trim(); if(!t||t.startsWith('#')||!t.includes('=')) continue;
  const i=t.indexOf('='); const k=t.slice(0,i).trim(); let v=t.slice(i+1).trim();
  if ((v.startsWith('\"')&&v.endsWith('\"'))||(v.startsWith(\"'\")&&v.endsWith(\"'\"))) v=v.slice(1,-1);
  if(!(k in process.env)) process.env[k]=v;
}
const { findZoneByName, cfRequest, getPagesProject, getAllPagesProjectsForAccount } = await import('file:///var/www/web-ten-mien/src/cloudflare.js');

const zone = await findZoneByName('gg88qt.com');
console.log('ZONE', zone && {id:zone.id,status:zone.status,name:zone.name,account:zone.account?.id});
if (zone) {
  const recs = await cfRequest('/zones/'+zone.id+'/dns_records?per_page=100');
  for (const r of recs||[]) {
    if (['A','AAAA','CNAME'].includes(r.type)) console.log('DNS', r.type, r.name, '->', r.content, 'proxied', r.proxied);
  }
}

// Search pages custom domains across accounts - use env tokens
const accounts = [];
if (process.env.CF_ACCOUNT_ID) accounts.push(process.env.CF_ACCOUNT_ID);
// parse multi-account if present in code
const raw = fs.readFileSync('/var/www/web-ten-mien/src/cloudflare.js','utf8');
const m = [...raw.matchAll(/accountId:\\s*[\"']([^\"']+)[\"']/g)].map(x=>x[1]);
const uniq=[...new Set([...accounts, ...m])];
console.log('accounts try', uniq);

for (const acc of uniq.slice(0,5)) {
  try {
    const projects = await getAllPagesProjectsForAccount(acc);
    for (const p of projects||[]) {
      try {
        const doms = await cfRequest('/accounts/'+acc+'/pages/projects/'+p.name+'/domains');
        const hit = (doms||[]).find(d => String(d.name||d).includes('gg88qt'));
        if (hit) console.log('PAGES_HIT', acc, p.name, JSON.stringify(hit));
      } catch {}
    }
  } catch(e) { console.log('acc fail', acc, e.message); }
}

// VIP domains.json keys containing qt
const vip=JSON.parse(fs.readFileSync('/var/www/Landingpages/GG88/ldpape_4d/domains.json','utf8'));
const qt=Object.keys(vip).filter(k=>k.includes('qt'));
console.log('VIP qt keys', qt);
console.log('VIP has gg88qt.com', 'gg88qt.com' in vip, 'www.gg88qt.com' in vip);
`;

const b64 = Buffer.from(script).toString("base64");
const c = new Client();
c.on("ready", () => {
  c.exec(`echo '${b64}' | base64 -d > /tmp/_probe_gg88qt3.mjs && node /tmp/_probe_gg88qt3.mjs`, (e, s) => {
    let o = "", err = "";
    s.on("data", (d) => (o += d));
    s.stderr.on("data", (d) => (err += d));
    s.on("close", () => {
      console.log(o);
      if (err) console.error(err.slice(0, 1500));
      c.end();
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
