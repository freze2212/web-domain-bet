import { Client } from "ssh2";

const remote = `
export TZ=Asia/Ho_Chi_Minh
sleep 20
echo '=== public curl (no force) ==='
curl -sI --max-time 25 https://llwinu.us/ | head -18
echo '--- title ---'
curl -sS --max-time 25 https://llwinu.us/ | grep -i '<title' | head -3
echo '--- domains.json ---'
curl -sS --max-time 25 "https://llwinu.us/domains.json?v=$(date +%s)" | head -c 400
echo
echo
echo '=== www ==='
curl -sI --max-time 25 https://www.llwinu.us/ | head -12
echo
cd /var/www/web-ten-mien
node --input-type=module <<'JS'
import { config } from './src/config.js';
import { cfRequest } from './src/cloudflare.js';
const acc = config.cloudflare.accountId();
const doms = await cfRequest('/accounts/' + acc + '/pages/projects/lp-xoamaan-6c-llwin/domains');
for (const d of doms||[]) if (String(d.name).includes('llwinu')) console.log(d.name, d.status, 'verify', d.verification_data?.status, d.verification_data?.error_message||'', 'ssl', d.validation_data?.status);
JS
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
