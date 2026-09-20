import { Client } from "ssh2";

const cmd = `
set -e
cd /var/www/web-ten-mien
export $(grep -v '^#' .env | xargs -0 2>/dev/null || true)

echo "=== GREP domains.json ==="
grep -r '"88kjc.dev"' /var/www/Landingpages --include='domains.json' -l 2>/dev/null | head -5 | while read f; do
  echo "FILE: $f"
  node -e "const j=require('fs').readFileSync(process.argv[1],'utf8'); const o=JSON.parse(j); console.log(JSON.stringify(o['88kjc.dev']||o['www.88kjc.dev'],null,2));" "$f"
done

echo "=== OWNERSHIP ==="
node -e "
import fs from 'fs';
const m=JSON.parse(fs.readFileSync('data/domain_ownership.json','utf8'));
console.log(JSON.stringify(m['88kjc.dev'],null,2));
"

echo "=== HISTORY (last 5) ==="
node -e "
import fs from 'fs';
let h=[];
try{h=JSON.parse(fs.readFileSync('data/history.json','utf8'));}catch{}
h.filter(x=>(x.domain||'').includes('88kjc')).slice(-5).forEach(x=>console.log(JSON.stringify({time:x.timestamp,action:x.actionLabel,status:x.status,link:x.link,error:x.error,template:x.templateName})));
"

echo "=== CF DNS via hub node ==="
node --input-type=module -e "
process.chdir('/var/www/web-ten-mien');
for (const line of require('fs').readFileSync('.env','utf8').split('\\n')) {
  const t=line.trim(); if(!t||t.startsWith('#')||!t.includes('=')) continue;
  const i=t.indexOf('='); process.env[t.slice(0,i).trim()]=t.slice(i+1).trim();
}
const { findZoneByName, cfRequest, tokenForZone } = await import('./src/cloudflare.js');
const D='88kjc.dev';
const z=await findZoneByName(D);
console.log('ZONE', z?{id:z.id,status:z.status,acc:z.account?.name}:null);
if(z){
  const tok=tokenForZone(z);
  const recs=await cfRequest('/zones/'+z.id+'/dns_records',{token:tok});
  console.log('DNS', JSON.stringify(recs.filter(r=>r.name.includes('88kjc')).map(r=>({t:r.type,n:r.name,c:r.content,p:r.proxied}))));
  try {
    const pr=await cfRequest('/zones/'+z.id+'/pagerules',{token:tok});
    console.log('PAGERULES', JSON.stringify(pr.map(r=>({st:r.status,tg:r.targets?.[0]?.constraint?.value,act:r.actions?.[0]}))));
  } catch(e){ console.log('PR_ERR', e.message); }
}
"

echo "=== PAGES custom domain ==="
node --input-type=module -e "
process.chdir('/var/www/web-ten-mien');
for (const line of require('fs').readFileSync('.env','utf8').split('\\n')) {
  const t=line.trim(); if(!t||t.startsWith('#')||!t.includes('=')) continue;
  const i=t.indexOf('='); process.env[t.slice(0,i).trim()]=t.slice(i+1).trim();
}
const { cfRequestFull } = await import('./src/cloudflare.js');
const acc=process.env.CLOUDFLARE_ACCOUNT_ID;
const D='88kjc.dev';
for (const proj of ['lp-gg88-vip-2','lp-gg88-vip-2-1','lp-gg88-vip-2-2','lp-gg88-vip-2-3']) {
  for (const n of [D,'www.'+D]) {
    try {
      const r=await cfRequestFull('/accounts/'+acc+'/pages/projects/'+proj+'/domains/'+encodeURIComponent(n));
      console.log('PAGES_OK', proj, n, JSON.stringify(r.result||r));
    } catch(e) {
      if(!/404|not found|10007/i.test(e.message)) console.log('PAGES', proj, n, e.message);
    }
  }
}
"

echo "=== HEALTH ==="
node --input-type=module -e "
process.chdir('/var/www/web-ten-mien');
for (const line of require('fs').readFileSync('.env','utf8').split('\\n')) {
  const t=line.trim(); if(!t||t.startsWith('#')||!t.includes('=')) continue;
  const i=t.indexOf('='); process.env[t.slice(0,i).trim()]=t.slice(i+1).trim();
}
const { inspectDomainHealth } = await import('./src/health-checker.js');
const r=await inspectDomainHealth('88kjc.dev');
console.log(JSON.stringify({overall:r.overallStatus,issues:r.issues,detectedLink:r.detectedLink,template:r.detectedTemplate?.name||r.detectedTemplate,checklist:r.checklist?.map(c=>({n:c.name,ok:c.ok,d:c.detail}))},null,2));
"
`;

const c = new Client();
c.on("ready", () => {
  c.exec(cmd, (e, s) => {
    let o = "", err = "";
    s.on("data", (d) => (o += d));
    s.stderr.on("data", (d) => (err += d));
    s.on("close", (code) => {
      if (err) console.error(err);
      console.log(o);
      c.end();
      process.exit(code || 0);
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
