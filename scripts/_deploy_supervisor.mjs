import { Client } from "ssh2";
import { readFileSync } from "fs";

const supervisor = readFileSync("c:/FREZE-PRJ/web-tên-miền/scripts/_hall_supervisor.js");
const lockPy = readFileSync("c:/FREZE-PRJ/web-tên-miền/scripts/_patch_keepalive_lock.py");

const remote = `
set -e
python3 /tmp/_patch_keepalive_lock.py
node --check /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js
echo SYNTAX_OK
cp -a /tmp/hall-supervisor.js /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/hall-supervisor.js
node --check /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/hall-supervisor.js

cat > /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/run-hall-supervisor.sh <<'SH'
#!/bin/bash
cd /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main
export HALL_WATCH_TABLES=C01,C03,C05,C02
export HALL_STALE_MS=150000
export HALL_SUPERVISOR_POLL_MS=45000
export HALL_RESTART_COOLDOWN_MS=180000
export HALL_PM2_TARGET=session_sexy_2
exec node hall-supervisor.js
SH
chmod +x /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/run-hall-supervisor.sh

pm2 delete hall_supervisor 2>/dev/null || true
pm2 start /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/run-hall-supervisor.sh --name hall_supervisor --interpreter bash
pm2 save
echo
pm2 jlist | python3 -c "import sys,json;d=json.load(sys.stdin);print([(p['name'],p['pm2_env']['status']) for p in d])"
sleep 3
tail -n 15 /root/.pm2/logs/hall-supervisor-out.log
echo
# cron belt: if supervisor process missing, start it (not restart session)
(crontab -l 2>/dev/null | grep -v hall_supervisor; echo '*/5 * * * * pm2 describe hall_supervisor >/dev/null || pm2 start /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/run-hall-supervisor.sh --name hall_supervisor --interpreter bash') | crontab -
echo CRON_OK
crontab -l | tail -3
`;

const c = new Client();
c.on("ready", () => {
  c.sftp((err, sftp) => {
    if (err) throw err;
    sftp.writeFile("/tmp/hall-supervisor.js", supervisor, (e2) => {
      if (e2) throw e2;
      sftp.writeFile("/tmp/_patch_keepalive_lock.py", lockPy, (e3) => {
        if (e3) throw e3;
        c.exec(remote, (e4, stream) => {
          let o = "";
          stream.on("data", (d) => (o += d.toString()));
          stream.stderr.on("data", (d) => (o += d.toString()));
          stream.on("close", (code) => {
            console.log(o || "(empty)");
            c.end();
            process.exit(code || 0);
          });
        });
      });
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
