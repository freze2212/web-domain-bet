import { Client } from "ssh2";

const cmd = `
echo '=== LS ==='
ls -la /var/www/media-vault | head -40
echo '=== SERVER HEAD ==='
head -120 /var/www/media-vault/server.js
echo '=== ENV ==='
if [ -f /var/www/media-vault/.env ]; then python3 - <<'PY'
import re
for line in open('/var/www/media-vault/.env'):
  t=line.strip()
  if not t or t.startswith('#') or '=' not in t: continue
  k,v=t.split('=',1)
  if any(x in k.upper() for x in ['TOKEN','SECRET','PASS','KEY']):
    print(f'{k}=***len{len(v.strip())}')
  else:
    print(f'{k}={v}')
PY
fi
echo '=== NGINX ==='
grep -RIn 'media-vault\\|blob.kcam\\|/uploads' /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null | head -40
echo '=== PM2 DESCRIBE ==='
pm2 describe media-vault | head -35
`;

const c = new Client();
c.on("ready", () => {
  c.exec(cmd, (e, s) => {
    let o = "";
    s.on("data", (d) => (o += d));
    s.stderr.on("data", (d) => (o += d));
    s.on("close", () => {
      console.log(o);
      c.end();
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
