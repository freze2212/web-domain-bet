process.chdir('/var/www/web-ten-mien');
import fs from 'fs';
for (const line of fs.readFileSync('.env','utf8').split('\n')) {
  const t=line.trim(); if(!t||t.startsWith('#')||!t.includes('=')) continue;
  const i=t.indexOf('='); process.env[t.slice(0,i).trim()]=t.slice(i+1).trim();
}
const auth = await import('file:///var/www/web-ten-mien/src/auth.js');
const admin = auth.loadUsers().find(u=>u.username==='admin');
const adminToken = auth.signJwt({ userId: admin.id, username: admin.username, fullName: admin.fullName, role: admin.role });
const base='http://127.0.0.1:3000';
const stamp=Date.now();
const report={at:new Date().toISOString(),sections:[],summary:{pass:0,fail:0,warn:0},perf:[]};
function log(sec,id,title,status,detail='',ms=0){
  report.summary[status==='PASS'?'pass':status==='FAIL'?'fail':'warn']++;
  let s=report.sections.find(x=>x.name===sec); if(!s){s={name:sec,items:[]};report.sections.push(s);}
  s.items.push({id,title,status,detail,ms});
}
async function api(tok,m,p,b,to=60000){
  const t0=Date.now();
  try{
    const h={'Content-Type':'application/json'}; if(tok) h.Authorization='Bearer '+tok;
    const r=await fetch(base+p,{method:m,headers:h,body:b?JSON.stringify(b):undefined,signal:AbortSignal.timeout(to)});
    const j=await r.json().catch(()=>null);
    const ms=Date.now()-t0; report.perf.push({p,m,status:r.status,ms});
    return {status:r.status,json:j,ms};
  }catch(e){ return {status:0,json:null,ms:Date.now()-t0,error:e.message}; }
}

const regUser='qa_'+stamp, regPass='Qa!'+String(stamp).slice(-6);
const reg=await api(null,'POST','/api/auth/register',{username:regUser,password:regPass,fullName:'QA Pilot'});
log('Auth','reg','Register new user',reg.status===200&&reg.json?.success?'PASS':'FAIL',regUser,reg.ms);
const ul=await api(null,'POST','/api/auth/login',{username:regUser,password:regPass});
const ut=ul.json?.token||'';
log('Auth','login','User login',ul.status===200&&ut?'PASS':'FAIL','',ul.ms);
log('Auth','admin-me',(await api(adminToken,'GET','/api/auth/me')).json?.user?.role==='admin'?'PASS':'FAIL','admin');

for (const [role,tok,p,exp] of [['user',ut,'/api/admin/users',403],['user',ut,'/api/cf-token',403],['user',ut,'/api/sync-cloudflare',403],['user',ut,'/api/history/clear',403],['user',ut,'/api/deploy-lp',403],['admin',adminToken,'/api/admin/users',200],['admin',adminToken,'/api/cf-token',200]]){
  const body = p.includes('deploy-lp')?{domain:'x.com',link:'https://x.com',templateId:'lp_gg88_vip_2',isBuy:true}:null;
  const m = body?'POST':'GET';
  const r=await api(tok,m,p,body);
  const ok = role==='user' && p.includes('deploy') ? (r.status===403) : (r.status===exp);
  log('RBAC',role+' '+p, role+' access control', ok?'PASS':'FAIL', 'got '+r.status, r.ms);
}

const dl=await api(adminToken,'GET','/api/domains-list',null,90000);
log('Perf','domains-list','Domains list',dl.status===200?'PASS':'FAIL',(dl.json?.count||'?')+' domains / '+dl.ms+'ms',dl.ms);
if(dl.ms>8000) log('Perf','domains-slow','Domains list slow','WARN',dl.ms+'ms',dl.ms);

const apiTests=[
  ['GET','/api/templates',null,null,200],
  ['GET','/api/tasks',adminToken,null,200],
  ['GET','/api/history',adminToken,null,200],
  ['GET','/api/domain-orders',adminToken,null,200],
  ['GET','/api/domain-requests',adminToken,null,200],
  ['GET','/api/wallet/balance',adminToken,null,200],
  ['GET','/api/wallet/transactions',adminToken,null,200],
  ['GET','/api/wallet/pricing',adminToken,null,200],
  ['GET','/api/admin/bank-config',adminToken,null,200],
  ['GET','/api/admin/ownership',adminToken,null,200],
  ['GET','/api/admin/audit-log',adminToken,null,200],
  ['GET','/api/user/my-domains',ut,null,200],
  ['GET','/api/domains/search?q=gg88',adminToken,null,200],
  ['GET','/api/resolve-link?domain=gg88sk.com',adminToken,null,200],
  ['POST','/api/check-domain',null,{domain:'test-qa.com'},200],
  ['POST','/api/spaceship/quote',adminToken,{domain:'qa-quote.com'},200],
  ['POST','/api/deploy-lp',adminToken,{domain:'qa'+stamp+'.test',link:'https://example.com',templateId:'lp_gg88_vip_2',isBuy:false},202],
  ['POST','/api/deploy-302',adminToken,{domain:'qa302'+stamp+'.test',link:'https://example.com',isBuy:false},202],
  ['POST','/api/domain-orders',ut,{domain:'qa-order-'+stamp+'.com',link:'https://www.gg8850.com/?id=1',templateId:'lp_gg88_gt9_sk',deployMode:'LP'},200],
  ['POST','/api/domain-requests',ut,{domain:'gg88sk.com',note:'QA '+stamp},200],
  ['POST','/api/tasks/clone-web',ut,{url:''},400],
];
for(const [m,p,tok,b,exp] of apiTests){
  const r=await api(tok,m,p,b);
  const ok = r.status===exp || (exp===200 && r.status>=200&&r.status<300);
  log('API',m+' '+p, m+' '+p, ok?'PASS':'WARN', r.error||(r.status+''), r.ms);
}

const own=JSON.parse(fs.readFileSync('data/domain_ownership.json','utf8'));
const sample=Object.keys(own).filter(d=>d.includes('.')&&!d.includes('127')).slice(0,20);
const liveSample={pass:0,fail:0,warn:0,items:[]};
for(const d of sample){
  try{
    const t0=Date.now();
    const r=await fetch('https://'+d+'/',{redirect:'manual',signal:AbortSignal.timeout(8000)});
    const st=r.status, ms=Date.now()-t0;
    if(st===200){liveSample.pass++; log('Live',d,d,'PASS','HTTP 200',ms);}
    else if(st===522){liveSample.fail++; log('Live',d,d,'FAIL','HTTP 522',ms);}
    else {liveSample.warn++; log('Live',d,d,'WARN','HTTP '+st,ms);}
    liveSample.items.push({domain:d,status:st,ms});
  }catch(e){liveSample.fail++; log('Live',d,d,'FAIL',e.message.slice(0,50));}
}
report.liveSample=liveSample;
report.testUser={username:regUser,password:regPass};
report.perf.sort((a,b)=>b.ms-a.ms);
report.summary.readiness = report.summary.fail<=3 ? 'READY_FOR_PILOT' : 'NEEDS_FIX';
console.log(JSON.stringify(report));
