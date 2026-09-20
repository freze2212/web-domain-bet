import { Client } from "ssh2";

const remote = `
export TZ=Asia/Ho_Chi_Minh
echo '=== resolv.conf ==='
cat /etc/resolv.conf
echo
IP=$(dig @1.1.1.1 +short llwinu.us A | head -1)
echo IP=$IP
echo '=== curl resolve ==='
curl -sI --max-time 25 --resolve llwinu.us:443:$IP --resolve llwinu.us:80:$IP https://llwinu.us/ | head -20
echo '--- title ---'
curl -sS --max-time 25 --resolve llwinu.us:443:$IP https://llwinu.us/ | grep -iE '<title|XOÁ|Xoa' | head -5
echo '--- domains ---'
curl -sS --max-time 25 --resolve llwinu.us:443:$IP https://llwinu.us/domains.json
echo
echo
# flush local nscd if any; try systemd-resolved
resolvectl flush-caches 2>/dev/null || true
systemd-resolve --flush-caches 2>/dev/null || true
echo '=== dig default after flush ==='
dig +short llwinu.us A
getent hosts llwinu.us || true
# try using 1.1.1.1 via curl DNS if available - not needed
echo '=== pages ssl again ==='
cd /var/www/web-ten-mien
node --input-type=module <<'JS'
import { config } from './src/config.js';
import { cfRequest } from './src/cloudflare.js';
const acc = config.cloudflare.accountId();
const doms = await cfRequest('/accounts/' + acc + '/pages/projects/lp-xoamaan-6c-llwin/domains');
for (const d of doms||[]) if (String(d.name).includes('llwinu')) console.log(d.name, d.status, JSON.stringify(d.validation_data), JSON.stringify(d.verification_data));
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
