import { Client } from "ssh2";
import { readFileSync } from "fs";

const localPy = "c:/FREZE-PRJ/web-tên-miền/scripts/_patch_dual_hall.py";
const remotePy = "/tmp/patch_dual_hall.py";

const after = `
set -e
python3 /tmp/patch_dual_hall.py
echo '=== verify snippets ==='
grep -n "HALL MISS\\|skip enter table\\|Bỏ session capture\\|startMissedRoundWatch\\|AUTO ENTER TABLE\\|removeListener" /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js | head -30
echo '=== stop supervisor + recapture session ==='
pm2 delete hall_supervisor >/dev/null 2>&1 || true
# session_sexy_1 cũ là capture scratch — thay bằng hall NS1
pm2 delete session_sexy_1 >/dev/null 2>&1 || true
pm2 delete session_sexy_2 >/dev/null 2>&1 || true
sleep 2
cd /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main
pm2 start ./run-ns1.sh --name session_sexy_1
sleep 8
pm2 start ./run-ns2.sh --name session_sexy_2
pm2 save
echo '=== pm2 ==='
pm2 jlist | python3 -c "import sys,json;d=json.load(sys.stdin)
for p in d:
  if p['name'] in ('session_sexy_1','session_sexy_2','hall_supervisor','server_sexy'):
    e=p['pm2_env']; print(p['name'], e.get('status'), e.get('pm_exec_path'), 'rst', e.get('restart_time'))"
echo '=== runners ==='
cat run-ns1.sh
echo '---'
cat run-ns2.sh
`;

const c = new Client();
c.on("ready", () => {
  c.sftp((err, sftp) => {
    if (err) throw err;
    sftp.fastPut(localPy, remotePy, (e) => {
      if (e) throw e;
      c.exec(after, (e2, s) => {
        let o = "";
        s.on("data", (d) => (o += d.toString()));
        s.stderr.on("data", (d) => (o += d.toString()));
        s.on("close", (code) => {
          console.log(o || "(empty)");
          console.log("exit", code);
          c.end();
        });
      });
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
