import { Client } from "ssh2";
const remote = `
const fs=require('fs');
console.log('WALLETS', fs.readFileSync('/var/www/web-ten-mien/data/wallets.json','utf8'));
const env=fs.readFileSync('/var/www/web-ten-mien/.env','utf8');
for (const k of ['ALLOW_SIMULATE_PAY','WALLET_WEBHOOK_SECRET']) {
  const m=env.split(/\\n/).find(l=>l.startsWith(k+'='));
  console.log(k+'='+(m? (m.split('=')[1]?'SET':'EMPTY') : 'MISSING'));
}
const tx=JSON.parse(fs.readFileSync('/var/www/web-ten-mien/data/transactions.json','utf8')).slice(0,8);
console.log('TX', JSON.stringify(tx.map(t=>({id:t.id,userId:t.userId,type:t.type,amount:t.amount,note:t.note,at:t.timestamp})),null,2));
`;
const b64=Buffer.from(remote).toString("base64");
const c=new Client();
c.on("ready",()=>{
  c.exec(`echo '${b64}' | base64 -d | node`,(e,s)=>{
    let o=""; s.on("data",d=>o+=d); s.stderr.on("data",d=>o+=d);
    s.on("close",()=>{console.log(o); c.end();});
  });
}).connect({host:"103.146.22.218",username:"root",password:"admin123@!"});
