import { Client } from "ssh2";

const cmd = `
export TZ=Asia/Ho_Chi_Minh
date
echo '=== NGINX ==='
ls -la /etc/nginx/sites-enabled/ | grep -E 'autotest|media' || true
echo '--- file ---'
cat /etc/nginx/sites-enabled/autotest-6888.top 2>/dev/null || echo 'NO_SITE_FILE'
echo '--- media vault nginx ---'
ls /etc/nginx/sites-enabled/ /etc/nginx/sites-available/ 2>/dev/null | head -80
echo
echo '=== MEDIA VAULT ==='
pm2 show media-vault | grep -E 'status|uptime|script|cwd|port' || true
ss -tlnp | grep -E '3500|media' || true
echo 'root' 
ls -la /var/www/media-vault/ | head
echo 'public'
ls /var/www/media-vault/public 2>/dev/null | head
echo 'uploads count'
ls /var/www/media-vault/uploads 2>/dev/null | wc -l
echo
echo '=== LIVE HEAD ==='
curl -sI --max-time 15 https://autotest-6888.top/ | head -20
echo '--- uploads ---'
curl -sI --max-time 15 https://autotest-6888.top/uploads/ | head -15
echo '--- api/files ---'
curl -sI --max-time 15 https://autotest-6888.top/api/files | head -15
echo '--- local 3500 ---'
curl -sI --max-time 8 http://127.0.0.1:3500/ | head -12
echo
echo '=== HUB DOMAIN ENTRY ==='
python3 - <<'PY'
import json,os
cands=[
 '/var/www/web-ten-mien/data/domains.json',
 '/var/www/web-ten-mien/domains.json',
]
for p in cands:
    if os.path.exists(p):
        print('found',p)
PY
# find autotest in hub data
python3 - <<'PY'
import os,json
root='/var/www/web-ten-mien'
for dirpath,ds,fs in os.walk(root):
    if 'node_modules' in dirpath: continue
    for f in fs:
        if f in ('domains.json','cloudflare.json') or 'domain' in f.lower():
            p=os.path.join(dirpath,f)
            try:
                t=open(p,encoding='utf-8',errors='ignore').read()
            except: continue
            if 'autotest-6888' in t:
                print('HIT', p)
PY
`;

const c = new Client();
c.on("ready", () => {
  c.exec(cmd, (e, s) => {
    let o = "";
    s.on("data", (d) => (o += d.toString()));
    s.stderr.on("data", (d) => (o += d.toString()));
    s.on("close", () => {
      console.log(o || "(empty)");
      c.end();
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
