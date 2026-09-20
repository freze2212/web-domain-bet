import { Client } from "ssh2";
const remote = `
process.chdir('/var/www/web-ten-mien');
const { config } = await import('file:///var/www/web-ten-mien/src/config.js');
const { cfRequest, cfRequestFull, findZoneByName, getAllPagesProjectsForAccount } = await import('file:///var/www/web-ten-mien/src/cloudflare.js');
const DOMAIN='autotest-6888.top';
const acc=config.cloudflare.accountId();
const zone=await findZoneByName(DOMAIN);
const recs=await cfRequest('/zones/'+zone.id+'/dns_records?per_page=100');
console.log('DNS', (recs||[]).filter(r=>r.name===DOMAIN||r.name==='www.'+DOMAIN).map(r=>({type:r.type,name:r.name,content:r.content,proxied:r.proxied})));

const projects=await getAllPagesProjectsForAccount(acc);
let hits=0;
for (const p of projects||[]) {
  try {
    const doms=await cfRequest('/accounts/'+acc+'/pages/projects/'+encodeURIComponent(p.name)+'/domains');
    for (const d of doms||[]) {
      if (String(d.name||'').includes('autotest-6888')) {
        console.log('STILL_ON_PAGES', p.name, d.name, d.status);
        await cfRequestFull('/accounts/'+acc+'/pages/projects/'+encodeURIComponent(p.name)+'/domains/'+encodeURIComponent(d.name),{method:'DELETE'});
        console.log('REMOVED', p.name, d.name);
        hits++;
      }
    }
  } catch {}
}
console.log('removed', hits);

// SSL mode
try {
  const ssl=await cfRequest('/zones/'+zone.id+'/settings/ssl');
  console.log('SSL_MODE', ssl?.value);
} catch(e){console.log('ssl err', e.message)}
`;
const b64=Buffer.from(remote).toString('base64');
const c=new Client();
c.on('ready',()=>{
  c.exec(`echo '${b64}' | base64 -d > /tmp/_dns_media2.mjs && node /tmp/_dns_media2.mjs`,(e,s)=>{
    let o=''; s.on('data',d=>o+=d); s.stderr.on('data',d=>o+=d);
    s.on('close',()=>{console.log(o); c.end();});
  });
}).connect({host:'103.146.22.218',username:'root',password:'admin123@!'});
