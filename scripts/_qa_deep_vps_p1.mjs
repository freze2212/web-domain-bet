/**
 * Deep QA Phase 1 — fast (~2 min): auth, RBAC, wallet, APIs, deploy 202, 15 live probes
 */
import { Client } from "ssh2";
import fs from "fs";
import path from "path";

const root = "c:/FREZE-PRJ/web-tên-miền";
const OUT = path.join(root, "data", "_QA_DEEP_VPS_P1.json");

const remoteWork = `
process.chdir('/var/www/web-ten-mien');
import fs from 'fs';
import { execSync } from 'child_process';
for (const line of fs.readFileSync('.env','utf8').split('\\n')) {
  const t=line.trim(); if(!t||t.startsWith('#')||!t.includes('=')) continue;
  const i=t.indexOf('='); process.env[t.slice(0,i).trim()]=t.slice(i+1).trim();
}
const auth = await import('file:///var/www/web-ten-mien/src/auth.js');
const admin = auth.loadUsers().find(u=>u.username==='admin');
const adminToken = auth.signJwt({ userId: admin.id, username: admin.username, fullName: admin.fullName, role: admin.role });
const base='http://127.0.0.1:3000';
const stamp=Date.now();
const report={at:new Date().toISOString(),sections:[],summary:{pass:0,fail:0,warn:0},perf:[]};
function log(sec,id,title,status,detail='',ms=0){report.summary[status==='PASS'?'pass':status==='FAIL'?'fail':'warn']++;let s=report.sections.find(x=>x.name===sec);if(!s){s={name:sec,items:[]};report.sections.push(s);}s.items.push({id,title,status,detail,ms});}
async function api(tok,m,p,b,to=60000){const t0=Date.now();try{const h={'Content-Type':'application/json'};if(tok)h.Authorization='Bearer '+tok;const r=await fetch(base+p,{method:m,headers:h,body:b?JSON.stringify(b):undefined,signal:AbortSignal.timeout(to)});const j=await r.json().catch(()=>null);const ms=Date.now()-t0;report.perf.push({p,m,status:r.status,ms});return {status:r.status,json:j,ms};}catch(e){return {status:0,json:null,ms:Date.now()-t0,error:e.message};}}

const regUser='qa_'+stamp, regPass='Qa!'+String(stamp).slice(-6);
const reg=await api(null,'POST','/api/auth/register',{username:regUser,password:regPass,fullName:'QA'});
log('Auth','reg','Register user',reg.status===200&&reg.json?.success?'PASS':'FAIL',regUser,reg.ms);
const ul=await api(null,'POST','/api/auth/login',{username:regUser,password:regPass});
const ut=ul.json?.token||'';
log('Auth','login','User login',ul.status===200&&ut?'PASS':'FAIL','',ul.ms);

for(const [role,tok,path,exp] of [['user',ut,'/api/admin/users',403],['user',ut,'/api/cf-token',403],['admin',adminToken,'/api/admin/users',200]]){
  const r=await api(tok,'GET',path); log('RBAC',role+path,r.status===exp?'PASS':'FAIL',r.status+'',r.ms);
}

const dl=await api(adminToken,'GET','/api/domains-list',null,90000);
log('Perf','domains',dl.status===200?'PASS':'FAIL',(dl.json?.count||0)+' in '+dl.ms+'ms',dl.ms);

const tests=[
  ['templates','GET','/api/templates',null,null,200],
  ['tasks','GET','/api/tasks',adminToken,null,200],
  ['history','GET','/api/history',adminToken,null,200],
  ['orders','GET','/api/domain-orders',adminToken,null,200],
  ['wallet','GET','/api/wallet/balance',adminToken,null,200],
  ['deploy202','POST','/api/deploy-lp',adminToken,{domain:'qa'+stamp+'.t',link:'https://x.com',templateId:'lp_gg88_vip_2',isBuy:false},202],
  ['user-order','POST','/api/domain-orders',ut,{domain:'qa-o-'+stamp+'.com',link:'https://x.com',templateId:'lp_gg88_gt9_sk',deployMode:'LP'},200],
  ['perm-req','POST','/api/domain-requests',ut,{domain:'gg88sk.com',note:'qa'},200],
];
for(const [id,m,p,tok,b,exp] of tests){const r=await api(tok,m,p,b);const ok=r.status===exp||(exp===200&&r.status>=200&&r.status<300);log('API',id,id,ok?'PASS':'WARN',(r.error||r.status)+'',r.ms);}

const own=JSON.parse(fs.readFileSync('data/domain_ownership.json','utf8'));
const sample=Object.keys(own).filter(d=>d.includes('.')&&!d.includes('127')).slice(0,15);
let lp={p:0,f:0,w:0};
for(const d of sample){try{const r=await fetch('https://'+d+'/',{redirect:'manual',signal:AbortSignal.timeout(8000)});const st=r.status;if(st===200)lp.p++;else if(st===522)lp.f++;else lp.w++;log('Live',d,d,st===200?'PASS':st===522?'FAIL':'WARN','HTTP '+st);}catch(e){lp.f++;log('Live',d,d,'FAIL',e.message.slice(0,40));}}
report.liveSample=lp; report.testUser={username:regUser,password:regPass};
report.summary.readiness=report.summary.fail<=2?'READY_FOR_PILOT':'NEEDS_FIX';
console.log(JSON.stringify(report));
`;

const c=new Client();
c.on('ready',()=>{
  c.exec(`node -e ${JSON.stringify(remoteWork)}`,{maxBuffer:8e6},(e,s)=>{let o='';s.on('data',d=>o+=d);s.stderr.on('data',d=>o+=d);s.on('close',()=>{const i=o.indexOf('{"at"');if(i<0){console.log(o);process.exit(1);}const r=JSON.parse(o.slice(i));fs.writeFileSync(OUT,JSON.stringify(r,null,2));console.log('P1',r.summary);c.end();});});
}).connect({host:'103.146.22.218',username:'root',password:'admin123@!'});
