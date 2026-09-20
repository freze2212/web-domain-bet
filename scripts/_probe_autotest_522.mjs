import { Client } from "ssh2";
const remote = `
process.chdir('/var/www/web-ten-mien');
const { config } = await import('file:///var/www/web-ten-mien/src/config.js');
const { cfRequest, findZoneByName } = await import('file:///var/www/web-ten-mien/src/cloudflare.js');
const fs = await import('fs');
const domain='autotest-6888.top';
const zone = await findZoneByName(domain);
console.log('ZONE', zone && {id:zone.id,status:zone.status,account:zone.account?.name||zone.account?.id});
if (zone) {
  const recs = await cfRequest('/zones/'+zone.id+'/dns_records?per_page=100');
  for (const r of recs||[]) {
    if (['A','AAAA','CNAME'].includes(r.type) && (r.name===domain || r.name==='www.'+domain || r.name.endsWith(domain)))
      console.log('DNS', r.type, r.name, '->', r.content, 'proxied', r.proxied);
  }
}
const acc = config.cloudflare.accountId();
for (const name of ['lp-gg88-gt9','lp-gg88-gt9-git2','gg88-lp-5uae','gg88-lp-5uae-5']) {
  try {
    const doms = await cfRequest('/accounts/'+acc+'/pages/projects/'+encodeURIComponent(name)+'/domains');
    const hit=(doms||[]).filter(d=>String(d.name||'').includes('autotest'));
    console.log('PAGES', name, 'count', (doms||[]).length, 'autotest', hit.map(d=>d.name+':'+d.status));
  } catch(e) { console.log('PAGES', name, e.message.slice(0,120)); }
}
// history latest
const hist=JSON.parse(fs.readFileSync('data/history.json','utf8'));
const list=Array.isArray(hist)?hist:(hist.history||[]);
const hits=list.filter(h=>h.domain===domain).slice(0,5);
for (const h of hits) console.log('HIST', h.actionType, h.templateName||h.templateId, h.cnameTarget, h.status, h.error||'');
`;
const b64=Buffer.from(remote).toString('base64');
const c=new Client();
c.on('ready',()=>{
  c.exec(`echo '${b64}' | base64 -d > /tmp/_probe_522.mjs && node /tmp/_probe_522.mjs`,(e,s)=>{
    let o=''; s.on('data',d=>o+=d); s.stderr.on('data',d=>o+=d);
    s.on('close',()=>{console.log(o); c.end();});
  });
}).connect({host:'103.146.22.218',username:'root',password:'admin123@!'});
