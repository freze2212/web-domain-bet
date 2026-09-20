import { Client } from "ssh2";
const remote = `
process.chdir('/var/www/web-ten-mien');
const { config } = await import('file:///var/www/web-ten-mien/src/config.js');
const { cfRequest, cfRequestFull, findZoneByName, getAllPagesProjectsForAccount } = await import('file:///var/www/web-ten-mien/src/cloudflare.js');
const DOMAIN='gg881.co';
const zone = await findZoneByName(DOMAIN);
console.log('ZONE', zone && {id:zone.id,status:zone.status,name:zone.name,account:zone.account?.id||zone.account?.name});
if (!zone) {
  // search cache
  const fs=await import('fs');
  const z=JSON.parse(fs.readFileSync('data/cf_zones_cache.json','utf8'));
  console.log('CACHE', z.filter(x=>x.name===DOMAIN||x.name==='www.'+DOMAIN));
  process.exit(0);
}
const recs = await cfRequest('/zones/'+zone.id+'/dns_records?per_page=100');
console.log('DNS', JSON.stringify((recs||[]).map(r=>({type:r.type,name:r.name,content:r.content,proxied:r.proxied,ttl:r.ttl})),null,2));

const acc = config.cloudflare.accountId();
const projects = await getAllPagesProjectsForAccount(acc);
let hits=[];
for (const p of projects||[]) {
  try {
    const doms = await cfRequest('/accounts/'+acc+'/pages/projects/'+encodeURIComponent(p.name)+'/domains');
    for (const d of doms||[]) {
      if (String(d.name||'').includes('gg881')) hits.push({project:p.name, domain:d.name, status:d.status});
    }
  } catch {}
}
console.log('PAGES_HITS', JSON.stringify(hits,null,2));
`;
const b64=Buffer.from(remote).toString('base64');
const c=new Client();
c.on('ready',()=>{
  c.exec(`echo '${b64}' | base64 -d > /tmp/_gg881.mjs && node /tmp/_gg881.mjs`,(e,s)=>{
    let o=''; s.on('data',d=>o+=d); s.stderr.on('data',d=>o+=d);
    s.on('close',()=>{console.log(o); c.end();});
  });
}).connect({host:'103.146.22.218',username:'root',password:'admin123@!'});
