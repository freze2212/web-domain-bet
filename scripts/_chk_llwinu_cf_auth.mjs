import { Client } from "ssh2";

const remote = `
export TZ=Asia/Ho_Chi_Minh
echo '=== NS ==='
dig +short NS llwinu.us
dig +trace llwinu.us 2>/dev/null | tail -20
whois llwinu.us 2>/dev/null | grep -iE 'Name Server|nserver|Status|Registrar' | head -20

echo
echo '=== CF tokens / accounts in env ==='
cd /var/www/web-ten-mien
grep -nE 'CF_|CLOUDFLARE|ACCOUNT|TOKEN' .env 2>/dev/null | sed -E 's/(TOKEN|KEY|SECRET)=.*/\\1=***/' | head -40
python3 - <<'PY'
import re,os
from pathlib import Path
# list account ids mentioned
for p in ['.env','src/config.js']:
  if not os.path.exists(p): continue
  t=open(p,encoding='utf-8',errors='ignore').read()
  for m in re.finditer(r'(CF_|CLOUDFLARE_)[A-Z0-9_]+=([^\\n]+)', t):
    k,v=m.group(1)+m.group(0).split('=')[0].split('_')[-1] if False else m.group(0).split('=')[0], m.group(2)
    print(m.group(0).split('=')[0], '=' , ('***' if any(x in m.group(0).upper() for x in ['TOKEN','KEY','SECRET','PASSWORD']) else v[:60]))
PY

echo
echo '=== config.js cloudflare multi-account? ==='
grep -nE 'account|token|apiToken|zones' src/config.js src/cloudflare.js | head -50

echo
echo '=== try who owns zone via verify token ==='
node --input-type=module <<'JS'
import { config } from './src/config.js';
const tokens = [];
const env = process.env;
for (const k of Object.keys(env)) {
  if (/CLOUDFLARE|CF_.*TOKEN|CF_API/i.test(k) && env[k] && env[k].length > 20) {
    tokens.push([k, env[k]]);
  }
}
// also from dotenv file
import fs from 'fs';
const envText = fs.readFileSync('.env','utf8');
for (const line of envText.split(/\\n/)) {
  const m = line.match(/^([A-Z0-9_]+)\\s*=\\s*["']?([^"']+)["']?\\s*$/);
  if (!m) continue;
  if (/TOKEN|API_KEY/i.test(m[1]) && /CF|CLOUDFLARE/i.test(m[1])) tokens.push([m[1], m[2]]);
}
console.log('token keys', tokens.map(t=>t[0]));
const zoneId = '5b43fb54a83235e7b341ab2a20f29adc';
for (const [name, token] of tokens) {
  const r = await fetch('https://api.cloudflare.com/client/v4/zones/' + zoneId + '/dns_records?per_page=5', {
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }
  });
  const j = await r.json();
  console.log(name, 'status', r.status, 'success', j.success, 'errs', JSON.stringify(j.errors||[]).slice(0,120), 'count', (j.result||[]).length);
  if (j.success) {
    for (const rec of j.result||[]) console.log(' ', rec.type, rec.name, rec.content);
  }
}
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
