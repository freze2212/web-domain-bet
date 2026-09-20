import { Client } from "ssh2";

const cmd = `
echo '=== backups ==='
ls -lt /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js* | head -25
echo
echo '=== pm2 ==='
pm2 jlist | python3 -c "import sys,json;d=json.load(sys.stdin)
for p in d:
  e=p['pm2_env']
  print(p['name'], e.get('status'), e.get('pm_exec_path'), e.get('restart_time'))"
echo
echo '=== session_sexy_1 runner ==='
pm2 show session_sexy_1 | grep -E 'script path|exec cwd|status|uptime'
ls /tmp/run-ns1.sh /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/run-ns*.sh 2>/dev/null
echo '--- run-ns1 ---'
cat /tmp/run-ns1.sh 2>/dev/null || true
echo '--- ecosystem / accounts ---'
grep -n "nameServiceSocket\\|ACCOUNT\\|username" /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/.env | head -20
python3 - <<'PY'
from pathlib import Path
# find account list
for f in Path('/var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main').rglob('*account*'):
  if 'node_modules' in str(f): continue
  print(f)
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
