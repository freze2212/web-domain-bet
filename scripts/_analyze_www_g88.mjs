import { Client } from "ssh2";

const cmd = `
echo '=== domains.json hits for g88.to ==='
grep -RIn --include='domains.json' -E '"g88\\.to"|"www\\.g88\\.to"' /var/www/Landingpages 2>/dev/null | head -40
echo
echo '=== ownership ==='
python3 - <<'PY'
import json
p='/var/www/web-ten-mien/data/domain_ownership.json'
d=json.load(open(p))
for k in ['g88.to','www.g88.to']:
  print(k, '=>', json.dumps(d.get(k), ensure_ascii=False)[:400] if k in d else 'MISSING')
PY
echo
echo '=== history recent g88.to ==='
python3 - <<'PY'
import json
h=json.load(open('/var/www/web-ten-mien/data/history.json'))
for x in h:
  dom=(x.get('domain') or '').lower()
  if dom in ('g88.to','www.g88.to') or dom.endswith('g88.to'):
    print(x.get('timestamp'), x.get('domain'), x.get('actionType'), x.get('templateName'), x.get('cnameTarget'), x.get('link','')[:60], x.get('status'))
PY
echo
echo '=== CF DNS dig ==='
dig +short g88.to A; dig +short g88.to CNAME; dig +short www.g88.to A; dig +short www.g88.to CNAME
echo '=== curl headers ==='
curl -sI -m 8 https://g88.to | head -15
echo '---'
curl -sI -m 8 https://www.g88.to | head -15
`;

const c = new Client();
c.on("ready", () => {
  c.exec(cmd, (e, s) => {
    let o = "";
    s.on("data", (d) => (o += d));
    s.stderr.on("data", (d) => (o += d));
    s.on("close", () => {
      console.log(o || "(empty)");
      c.end();
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
