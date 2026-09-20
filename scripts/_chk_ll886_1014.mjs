import { Client } from "ssh2";

const remoteCode = `
process.chdir('/var/www/web-ten-mien');
const fs = await import('node:fs');
for (const line of fs.readFileSync('.env','utf8').split('\\n')) {
  const t=line.trim(); if(!t||t.startsWith('#')||!t.includes('=')) continue;
  const i=t.indexOf('='); const k=t.slice(0,i).trim(); const v=t.slice(i+1).trim();
  if(!(k in process.env)) process.env[k]=v;
}
const cf = await import('file:///var/www/web-ten-mien/src/cloudflare.js');
const { config } = await import('file:///var/www/web-ten-mien/src/config.js');
const DOMAIN='ll886.us';
const zone = await cf.findZoneByName(DOMAIN);
console.log('ZONE', zone && {id:zone.id, status:zone.status, acc:zone.account?.name, admin:cf.isAdminAccountZone(zone)});
const zOpts = { token: cf.tokenForZone(zone) };
const recs = await cf.cfRequest('/zones/'+zone.id+'/dns_records?per_page=100', zOpts);
console.log('DNS', JSON.stringify((recs||[]).filter(r=>r.name===DOMAIN||r.name==='www.'+DOMAIN).map(r=>({type:r.type,name:r.name,content:r.content,proxied:r.proxied}))));

const frezeAcc = config.cloudflare.accountId();
const projects = await cf.getAllPagesProjectsForAccount(frezeAcc);
const hits=[];
for (const p of projects||[]) {
  try {
    const doms = await cf.cfRequest('/accounts/'+frezeAcc+'/pages/projects/'+encodeURIComponent(p.name)+'/domains');
    for (const d of doms||[]) {
      const n=String(d.name||'').toLowerCase();
      if (n===DOMAIN || n==='www.'+DOMAIN) hits.push({project:p.name, domain:d.name, status:d.status});
    }
  } catch {}
}
console.log('FREZE_PAGES', JSON.stringify(hits,null,2));
`;

const b64 = Buffer.from(remoteCode).toString("base64");
const c = new Client();
c.on("ready", () => {
  c.exec(`echo '${b64}' | base64 -d > /tmp/_chk1014.mjs && node /tmp/_chk1014.mjs`, (e, s) => {
    let o = "";
    s.on("data", (d) => (o += d));
    s.stderr.on("data", (d) => (o += d));
    s.on("close", () => {
      console.log(o);
      c.end();
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
