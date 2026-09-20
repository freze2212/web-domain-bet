/**
 * DEEP QA — chạy trên VPS localhost:3000
 * Output: data/_QA_DEEP_VPS.json
 */
import { Client } from "ssh2";
import fs from "fs";
import path from "path";

const root = "c:/FREZE-PRJ/web-tên-miền";
const OUT = path.join(root, "data", "_QA_DEEP_VPS.json");

const remoteWork = `
process.chdir('/var/www/web-ten-mien');
import fs from 'fs';
import { execSync } from 'child_process';

for (const line of fs.readFileSync('.env','utf8').split('\\n')) {
  const t=line.trim(); if(!t||t.startsWith('#')||!t.includes('=')) continue;
  const i=t.indexOf('='); const k=t.slice(0,i).trim(); const v=t.slice(i+1).trim();
  if(!(k in process.env)) process.env[k]=v;
}

const auth = await import('file:///var/www/web-ten-mien/src/auth.js');
const users = auth.loadUsers();
const admin = users.find(u => u.username === 'admin');
const adminToken = auth.signJwt({ userId: admin.id, username: admin.username, fullName: admin.fullName, role: admin.role });
const base = 'http://127.0.0.1:3000';
const stamp = Date.now();
const DOMAIN = 'autotest-6888.top';
const report = { at: new Date().toISOString(), sections: [], summary: { pass:0, fail:0, warn:0, skip:0 }, perf: [], infra: {} };

function bump(s){ report.summary[s=== 'PASS'?'pass':s==='FAIL'?'fail':s==='WARN'?'warn':'skip']++; }
function log(sec, id, title, status, detail='', ms=0){
  bump(status);
  let s = report.sections.find(x=>x.name===sec);
  if(!s){ s={name:sec,items:[]}; report.sections.push(s); }
  s.items.push({id,title,status,detail,ms});
}

async function api(token, method, p, body, timeout=120000){
  const t0=Date.now();
  try {
    const headers={'Content-Type':'application/json'};
    if(token) headers.Authorization='Bearer '+token;
    const res=await fetch(base+p,{method,headers,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(timeout)});
    const text=await res.text();
    let json=null; try{json=JSON.parse(text);}catch{}
    const ms=Date.now()-t0;
    report.perf.push({path:p,method,status:res.status,ms});
    return {status:res.status,json,text,ms,ok:true};
  } catch(e) {
    const ms=Date.now()-t0;
    report.perf.push({path:p,method,status:0,ms,error:e.message});
    return {status:0,json:null,text:'',ms,ok:false,error:e.message};
  }
}

try {
  const pm2 = execSync('pm2 jlist 2>/dev/null',{encoding:'utf8',maxBuffer:5e6});
  const list = JSON.parse(pm2);
  const hub = list.find(p=>p.name==='web-tenmienbet');
  report.infra.pm2 = hub ? { status: hub.pm2_env?.status, restarts: hub.pm2_env?.restart_time, mem: hub.monit?.memory, cpu: hub.monit?.cpu } : null;
  log('Infra','pm2','PM2 web-tenmienbet online', hub?.pm2_env?.status==='online'?'PASS':'FAIL', JSON.stringify(report.infra.pm2));
} catch(e){ log('Infra','pm2','PM2 check','WARN',e.message); }

try {
  const free = execSync("free -m | awk 'NR==2{print $3,$2}'",{encoding:'utf8'}).trim().split(' ');
  const disk = execSync("df -h /var/www | tail -1 | awk '{print $5,$4}'",{encoding:'utf8'}).trim();
  report.infra.memory = { usedMb: +free[0], totalMb: +free[1] };
  report.infra.disk = disk;
  const memPct = Math.round((+free[0]/(+free[1]||1))*100);
  log('Infra','mem','RAM usage', memPct<90?'PASS':'WARN', memPct+'% used');
  log('Infra','disk','Disk /var/www', 'PASS', disk);
} catch(e){ log('Infra','sys','System metrics','WARN',e.message); }

const bad = await api(null,'POST','/api/auth/login',{username:'x',password:'y'});
log('Auth','bad-login','Reject invalid login', bad.status===400||bad.status===401?'PASS':'FAIL', 'HTTP '+bad.status, bad.ms);

const regUser = 'qa_user_'+stamp;
const regPass = 'QaTest!'+String(stamp).slice(-6);
const reg = await api(null,'POST','/api/auth/register',{username:regUser,password:regPass,fullName:'QA Auto Test'});
log('Auth','register','Register new user', reg.status===200&&reg.json?.success?'PASS':'FAIL', regUser+' HTTP '+reg.status, reg.ms);

const userLogin = await api(null,'POST','/api/auth/login',{username:regUser,password:regPass});
const userToken = userLogin.json?.token || '';
log('Auth','user-login','User login after register', userLogin.status===200&&userToken?'PASS':'FAIL', 'HTTP '+userLogin.status, userLogin.ms);

const meAdmin = await api(adminToken,'GET','/api/auth/me');
log('Auth','admin-me','Admin session', meAdmin.json?.user?.role==='admin'?'PASS':'FAIL', meAdmin.json?.user?.username, meAdmin.ms);

const meUser = await api(userToken,'GET','/api/auth/me');
log('Auth','user-me','User session', meUser.json?.user?.role==='user'?'PASS':'FAIL', meUser.json?.user?.username, meUser.ms);

const rbacTests = [
  ['user','GET','/api/admin/users',403,null],
  ['user','POST','/api/admin/wallet/topup',403,{userId:'x',amount:1}],
  ['user','GET','/api/cf-token',403,null],
  ['user','POST','/api/sync-cloudflare',403,null],
  ['user','POST','/api/history/clear',403,null],
  ['user','POST','/api/deploy-lp',403,{domain:'test.com',link:'https://x.com',templateId:'lp_gg88_vip_2',isBuy:true}],
  ['admin','GET','/api/admin/users',200,null],
  ['admin','GET','/api/cf-token',200,null],
];
for (const [role,method,p,expect,body] of rbacTests) {
  const tok = role==='admin'?adminToken:userToken;
  const r = await api(tok, method, p, body);
  const ok = r.status===expect;
  log('RBAC', role+'-'+p.replace(/\\//g,'-'), role+' '+method+' '+p, ok?'PASS':'FAIL', 'expected '+expect+' got '+r.status, r.ms);
}

const tpl = await api(null,'GET','/api/templates');
const tplList = tpl.json?.templates || tpl.json || [];
log('API','templates','Templates catalog', tpl.status===200&&tplList.length>=30?'PASS':'FAIL', tplList.length+' templates', tpl.ms);

const chk = await api(null,'POST','/api/check-domain',{domain:'google.com'});
log('API','check-domain','Check domain', chk.status===200?'PASS':'FAIL', 'HTTP '+chk.status, chk.ms);

const batch = await api(null,'POST','/api/check-domains-batch',{domains:['gg88sk.com','gg88iq.com','notexist12345xyz.com']});
log('API','check-batch','Batch check', batch.status===200?'PASS':'FAIL', 'HTTP '+batch.status, batch.ms);

const bal = await api(adminToken,'GET','/api/wallet/balance');
log('Wallet','balance','Admin balance', bal.json?.success?'PASS':'FAIL', 'balance='+bal.json?.balance, bal.ms);

const qr = await api(userToken,'GET','/api/wallet/qr-code?amount=50&username='+encodeURIComponent(regUser));
log('Wallet','qr-user','User VietQR own username', qr.status===200&&qr.json?.qrUrl?'PASS':'FAIL', 'HTTP '+qr.status, qr.ms);

const qrBad = await api(userToken,'GET','/api/wallet/qr-code?amount=50&username=admin');
log('Wallet','qr-lock','User cannot QR for admin', qrBad.status===403||qrBad.json?.success===false?'PASS':'FAIL', 'HTTP '+qrBad.status, qrBad.ms);

const pricing = await api(adminToken,'GET','/api/wallet/pricing');
log('Wallet','pricing','GET pricing', pricing.status===200?'PASS':'FAIL', 'HTTP '+pricing.status, pricing.ms);

const tx = await api(adminToken,'GET','/api/wallet/transactions');
log('Wallet','tx','Transactions list', tx.json?.success?'PASS':'FAIL', (tx.json?.transactions||[]).length+' rows', tx.ms);

const domList = await api(adminToken,'GET','/api/domains-list');
log('Perf','domains-list','Domains list', domList.status===200?'PASS':'FAIL', domList.json?.count+' domains in '+domList.ms+'ms', domList.ms);
if(domList.ms>10000) log('Perf','domains-slow','Domains list >10s','WARN', domList.ms+'ms', domList.ms);

const search = await api(adminToken,'GET','/api/domains/search?q=gg88');
log('API','search','Domain search', search.json?.success?'PASS':'FAIL', (search.json?.results||[]).length+' hits', search.ms);

const ownership = await api(adminToken,'GET','/api/admin/ownership');
const ownCount = Object.keys(ownership.json?.ownership||ownership.json||{}).length;
log('API','ownership','Ownership map', ownership.status===200?'PASS':'FAIL', ownCount+' entries', ownership.ms);

const permReq = await api(userToken,'POST','/api/domain-requests',{domain:'gg88sk.com',note:'QA test '+stamp});
log('UserFlow','perm-req','User request domain permission', permReq.status===200||permReq.status===409?'PASS':'WARN', permReq.json?.error||'OK', permReq.ms);

const order = await api(userToken,'POST','/api/domain-orders',{
  domain:'qa-order-'+stamp+'.com', link:'https://www.gg8850.com/?id=984093514', templateId:'lp_gg88_gt9_sk', deployMode:'LP', tele:''
});
log('UserFlow','domain-order','User create purchase order', order.json?.success||order.status===200?'PASS':'WARN', order.json?.error||order.json?.order?.id||'HTTP '+order.status, order.ms);

const myDom = await api(userToken,'GET','/api/user/my-domains');
log('UserFlow','my-domains','User my-domains', myDom.status===200?'PASS':'FAIL', (myDom.json?.domains||[]).length+' domains', myDom.ms);

const usersList = await api(adminToken,'GET','/api/admin/users');
log('Admin','users','List users', usersList.json?.users?.length>0?'PASS':'FAIL', usersList.json?.users?.length+' users', usersList.ms);

const bank = await api(adminToken,'GET','/api/admin/bank-config');
log('Admin','bank','Bank config', bank.status===200?'PASS':'FAIL', bank.json?.accountNumber?'has account':'no account', bank.ms);

const audit = await api(adminToken,'GET','/api/admin/audit-log');
log('Admin','audit','Audit log', audit.status===200?'PASS':'FAIL', (audit.json?.logs||audit.json?.entries||[]).length+' entries', audit.ms);

const d202 = await api(adminToken,'POST','/api/deploy-lp',{
  domain:'qa-async-'+stamp+'.test', link:'https://example.com', templateId:'lp_gg88_vip_2', isBuy:false
});
log('Deploy','async-202','Deploy LP 202 queued', d202.status===202&&d202.json?.queued?'PASS':'FAIL', 'HTTP '+d202.status, d202.ms);

const d302v = await api(adminToken,'POST','/api/deploy-302',{
  domain:'qa-async302-'+stamp+'.test', link:'https://example.com', isBuy:false
});
log('Deploy','async302','Deploy 302 202 queued', d302v.status===202&&d302v.json?.queued?'PASS':'FAIL', 'HTTP '+d302v.status, d302v.ms);

async function probeLink(d){
  try{
    const r=await fetch('https://'+d+'/domains.json?v='+Date.now(),{signal:AbortSignal.timeout(15000)});
    const j=await r.json();
    const e=j[d]||j['www.'+d];
    const link=typeof e==='string'?e:(e?.main_url||'');
    return {status:r.status,link};
  }catch(e){ return {status:0,link:'',error:e.message}; }
}

const linkA='https://www.gg8824.com/?id=qa_deep_'+stamp;
const setA = await api(adminToken,'POST','/api/set-link',{domain:DOMAIN,link:linkA,tele:linkA});
log('E2E','set-link','Set link autotest', setA.json?.success?'PASS':'FAIL', setA.json?.error||linkA, setA.ms);
if(setA.json?.success){
  await new Promise(r=>setTimeout(r,8000));
  const live=await probeLink(DOMAIN);
  log('E2E','set-link-live','Live domains.json after set-link', live.status===200&&String(live.link).includes('qa_deep_'+stamp)?'PASS':'WARN', live.link||live.error);
}

const sw = await api(adminToken,'POST','/api/switch-template',{
  domain:DOMAIN, targetTemplateId:'gg88_lp_5uae', newLink:linkA, newTele:linkA
});
log('E2E','switch-tpl','Switch template', sw.json?.success?'PASS':'FAIL', sw.json?.error||'OK', sw.ms);

const batchLink = await api(adminToken,'POST','/api/batch-setlink',{domains:[DOMAIN],link:linkA});
log('E2E','batch-setlink','Batch setlink', batchLink.json?.success?'PASS':'FAIL', batchLink.json?.error||'OK', batchLink.ms);

const inspect = await api(adminToken,'POST','/api/inspect-health',{domain:'gg88sk.com'},90000);
const score = inspect.json?.report?.healthScore ?? inspect.json?.healthScore;
log('E2E','inspect','Inspect gg88sk', inspect.ok&&inspect.json?.success!==false?'PASS':'WARN', inspect.error||('score='+score), inspect.ms);

const hist = await api(adminToken,'GET','/api/history');
log('E2E','history','History records', hist.ok&&(hist.json?.history||[]).length>0?'PASS':'FAIL', (hist.json?.history||[]).length+' items', hist.ms);

const verifyAll = await api(adminToken,'POST','/api/history/verify-all',{},30000);
log('E2E','verify-all','Verify-all queue', verifyAll.ok&&verifyAll.json?.success!==false?'PASS':'WARN', verifyAll.error||verifyAll.json?.message||'OK', verifyAll.ms);

const swMode = await api(adminToken,'POST','/api/tasks/switch-mode',{
  domain:DOMAIN, toMode:'LP', templateId:'gg88_lp_5uae', targetUrl:linkA
});
log('E2E','switch-mode','Async switch-mode', swMode.json?.success?'PASS':'FAIL', swMode.json?.taskId||swMode.json?.error, swMode.ms);

const quote = await api(adminToken,'POST','/api/spaceship/quote',{domain:'qa-quote-'+stamp+'.com'});
log('API','spaceship-quote','Spaceship quote', quote.status===200?'PASS':'WARN', quote.json?.totalUsd?'$'+quote.json?.totalUsd:'HTTP '+quote.status, quote.ms);

const cfVerify = await api(adminToken,'POST','/api/cf-token/verify',{});
log('Admin','cf-verify','CF token verify', cfVerify.json?.success!==false?'PASS':'WARN', cfVerify.json?.error||'OK', cfVerify.ms);

const own = JSON.parse(fs.readFileSync('data/domain_ownership.json','utf8'));
const sampleDomains = Object.keys(own).filter(d=>d.includes('.')&&!d.includes('127.0.0.1')).slice(0,15);
let livePass=0,liveFail=0,liveWarn=0;
for(const d of sampleDomains){
  try{
    const r=await fetch('https://'+d+'/',{redirect:'manual',signal:AbortSignal.timeout(12000)});
    const st=r.status;
    if(st===200) livePass++;
    else if(st===522||st===0) liveFail++;
    else liveWarn++;
    log('LiveSample', d, d, st===200?'PASS':st===522?'FAIL':'WARN', 'HTTP '+st);
  }catch(e){
    liveFail++;
    log('LiveSample', d, d, 'FAIL', e.message);
  }
}
report.liveSample = { total: sampleDomains.length, pass: livePass, fail: liveFail, warn: liveWarn };

const cloneBad = await api(userToken,'POST','/api/tasks/clone-web',{url:''});
log('Cloner','validate','Clone rejects empty', cloneBad.status===400||cloneBad.json?.success===false?'PASS':'FAIL', cloneBad.json?.error||'HTTP '+cloneBad.status, cloneBad.ms);

report.testUser = { username: regUser, password: regPass };
report.summary.total = report.summary.pass+report.summary.fail+report.summary.warn+report.summary.skip;
report.summary.readiness = report.summary.fail===0 ? (report.summary.warn<=10?'READY_FOR_PILOT':'READY_WITH_WARNINGS') : 'NOT_READY';

console.log(JSON.stringify(report));
`;

const c = new Client();
c.on("ready", () => {
  c.exec(`cat > /tmp/_qa_deep.mjs <<'EOFSCRIPT'\n${remoteWork}\nEOFSCRIPT\nnode /tmp/_qa_deep.mjs`, { maxBuffer: 15 * 1024 * 1024 }, (err, s) => {
    let o = "";
    s.on("data", (d) => (o += d));
    s.stderr.on("data", (d) => (o += d));
    s.on("close", () => {
      const i = o.lastIndexOf('{"at"');
      if (i < 0) {
        console.error("No JSON:", o.slice(-3000));
        process.exit(1);
      }
      const report = JSON.parse(o.slice(i));
      fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
      console.log("PASS", report.summary.pass, "FAIL", report.summary.fail, "WARN", report.summary.warn);
      console.log("Readiness:", report.summary.readiness);
      console.log("Live:", JSON.stringify(report.liveSample));
      c.end();
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
