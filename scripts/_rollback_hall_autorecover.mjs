import { Client } from "ssh2";

const cmd = `
set -e
export TZ=Asia/Ho_Chi_Minh
FILE=/var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js
BAK=$(ls -1t \${FILE}.bak-hall-recover-* 2>/dev/null | head -1)
echo "BACKUP=\$BAK"
if [ -z "\$BAK" ] || [ ! -f "\$BAK" ]; then
  echo 'NO BACKUP'; exit 1
fi
cp -a "\$FILE" "\${FILE}.bad-autorecover-\$(date +%s)"
cp -a "\$BAK" "\$FILE"
echo 'RESTORED from backup'
grep -c 'maybeRecoverStaleHall' "\$FILE" || echo 'recover gone OK'
grep -n 'function startActiveTableHeartbeat' -A8 "\$FILE" | head -15
pm2 restart session_sexy_2 --update-env
sleep 8
pm2 show session_sexy_2 | grep -iE 'status|uptime|restart|created'
echo '--- boot ---'
tail -n 15 /root/.pm2/logs/session-sexy-2-out.log
`;

const c = new Client();
c.on("ready", () => {
  c.exec(cmd, { pty: true }, (e, s) => {
    let o = "";
    s.on("data", (d) => (o += d.toString()));
    s.stderr.on("data", (d) => (o += d.toString()));
    s.on("close", (code) => {
      console.log(o || "(empty)");
      process.exit(code || 0);
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
