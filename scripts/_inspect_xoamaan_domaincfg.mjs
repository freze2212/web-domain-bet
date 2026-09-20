import { Client } from "ssh2";

const cmd = `
cd /var/www/Landingpages/LLWIN/lp-6c-xoamaan-llwin
python3 - <<'PY'
from pathlib import Path
# DEFAULT_DOMAIN_CONFIGS and save format
t=Path('assets/js/db.js').read_text(encoding='utf-8')
i=t.find('DEFAULT_DOMAIN_CONFIGS')
print(t[i:i+800])
print('--- getDomainConfig ---')
j=t.find('getDomainConfig')
print(t[j:j+600])
print('--- upsertDomainConfig ---')
k=t.find('upsertDomainConfig') if 'upsertDomainConfig' in t else t.find('saveDomainConfig')
print('idx',k)
# find setDomainConfig
for name in ['setDomainConfig','saveDomainConfig','updateDomainConfig']:
  idx=t.find(name)
  print(name, idx)
  if idx>=0: print(t[idx:idx+500])
PY
echo
echo '=== functions default ==='
grep -n "DEFAULT_DOMAIN_CONFIGS\\|domainConfigs\\|defaultHouseLink" functions/api/\\[\\[route\\]\\].js | head -30
sed -n '1,100p' functions/api/\\[\\[route\\]\\].js
`;

const c = new Client();
c.on("ready", () => {
  c.exec(cmd, (e, s) => {
    let o = "";
    s.on("data", (d) => (o += d.toString()));
    s.stderr.on("data", (d) => (o += d.toString()));
    s.on("close", () => {
      console.log(o.slice(0, 12000) || "(empty)");
      c.end();
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
