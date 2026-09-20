import { Client } from "ssh2";

const remote = `
export TZ=Asia/Ho_Chi_Minh
echo '=== dig @CF NS ==='
dig @matteo.ns.cloudflare.com llwinu.us A +short
dig @michelle.ns.cloudflare.com llwinu.us A +short
dig @matteo.ns.cloudflare.com llwinu.us CNAME +short
dig @1.1.1.1 llwinu.us A +short
dig @8.8.8.8 llwinu.us A +short
echo
echo '=== pages status ==='
cd /var/www/web-ten-mien
node --input-type=module <<'JS'
import { config } from './src/config.js';
import { cfRequest } from './src/cloudflare.js';
const acc = config.cloudflare.accountId();
const doms = await cfRequest('/accounts/' + acc + '/pages/projects/lp-xoamaan-6c-llwin/domains');
for (const d of doms||[]) {
  if (String(d.name).includes('llwinu')) console.log(JSON.stringify({name:d.name,status:d.status,verify:d.verification_data,ssl:d.validation_data},null,2));
}
JS
echo
echo '=== curl with resolve force CF IP if any ==='
IP=$(dig @1.1.1.1 +short llwinu.us A | head -1)
echo IP=$IP
if [ -n "$IP" ]; then
  curl -sI --max-time 20 --resolve llwinu.us:443:$IP https://llwinu.us/ | head -20
  curl -sS --max-time 20 --resolve llwinu.us:443:$IP https://llwinu.us/domains.json | head -c 400
  echo
else
  echo 'still no A from 1.1.1.1 — wait/retry'
  sleep 25
  dig @1.1.1.1 llwinu.us A +short
  dig @matteo.ns.cloudflare.com llwinu.us A +norecurse +short
  curl -sI --max-time 20 https://llwinu.us/ | head -15
fi
`;

const c = new Client();
c.on("ready", () => {
  c.exec(remote, (e, s) => {
    let o = "";
    s.on("data", (d) => (o += d.toString()));
    s.stderr.on("data", (d) => (o += d.toString()));
    s.on("close", () => {
      console.log(o || "(empty)");
      c.end();
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
