import { Client } from "ssh2";
const remote = `
import fs from 'fs';
const j=JSON.parse(fs.readFileSync('/var/www/web-ten-mien/data/_FREZE_PAGES_VS_HUB.json','utf8'));
const hubBases=new Set((j.hubProjects||[]).map(x=>String(x).replace(/-\\d+$/,'')));
const siblings=[];
const realMissing=[];
for (const m of j.missingOnHub||[]) {
  const base=String(m.name).replace(/-\\d+$/,'');
  const isSibling=/-(?:git)?\\d+$/i.test(m.name) && (hubBases.has(base) || hubBases.has(base.replace(/-git$/,'')) || [...hubBases].some(h=>m.name.startsWith(h+'-')||m.name.startsWith(h.replace(/-\\d+$/,'')+'-')));
  // simpler: if name ends with -git2/-2/-3/-4/-5 and base without suffix is in hub
  const root=m.name.replace(/-git\\d+$/i,'').replace(/-\\d+$/,'');
  if ([...hubBases].some(h=>h===root || root.startsWith(h) || h.startsWith(root))) siblings.push(m.name);
  else realMissing.push(m.name);
}
console.log(JSON.stringify({siblings, realMissing},null,2));
`;
const b64=Buffer.from(remote).toString('base64');
const c=new Client();
c.on('ready',()=>{
  c.exec(`echo '${b64}' | base64 -d > /tmp/_cat_miss.mjs && node /tmp/_cat_miss.mjs`,(e,s)=>{
    let o=''; s.on('data',d=>o+=d); s.on('close',()=>{console.log(o);c.end();});
  });
}).connect({host:'103.146.22.218',username:'root',password:'admin123@!'});
