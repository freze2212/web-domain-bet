import { Client } from "ssh2";

const remote = `
set -e
# Turn OFF hall-only — enter C03 again (prediction pipeline)
cat > /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/run-ns2.sh <<'SH'
#!/bin/bash
cd /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main
export ACCOUNT_INDEX=2
export SKIP_BOOT_DELAY=1
export HEADLESS=1
export USE_FIREFOX=1
export DOTENV_CONFIG_PATH=/var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/.env
exec node --max-old-space-size=1024 -r dotenv/config servicePuppeteer/session.js
SH
chmod +x /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/run-ns2.sh
cp -a /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/run-ns2.sh /tmp/run-ns2.sh

# Keep bot photo skip off for enter-table mode (capture available)
cat > /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/run-bot-ns2.sh <<'SH'
#!/bin/bash
cd /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main
export NAME_SERVICE=NS2
export HO_VIA_BOT=1
export PYTHONUNBUFFERED=1
export GROUP=-1004296530499
export GROUP_NS2=-1004296530499
exec ./venv/bin/python bot.py
SH
chmod +x /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/run-bot-ns2.sh
cp -a /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/run-bot-ns2.sh /tmp/run-bot-ns2.sh

pm2 restart session_sexy_2 --update-env
pm2 restart bot_sexy_2 --update-env
echo restarted
sleep 100
export TZ=Asia/Ho_Chi_Minh
date
curl -sS -m 5 https://tool.toolbcr79.com/api/get-active-table; echo
echo '=== session ==='
grep -E '16:3[1-9]|16:4|AUTO ENTER|CLICK TABLE|IN ROOM|NOTIFY|FORWARD|HALL ONLY|Error in main|BÀN CƯỢC' /root/.pm2/logs/session-sexy-2-out.log | tail -40
echo '=== bot ==='
tail -n 20 /root/.pm2/logs/bot-sexy-2-out.log
`;

const c = new Client();
c.on("ready", () => {
  c.exec(remote, (e, s) => {
    let o = "";
    s.on("data", (d) => (o += d.toString()));
    s.stderr.on("data", (d) => (o += d.toString()));
    s.on("close", (code) => {
      console.log(o || "(empty)");
      c.end();
      process.exit(code || 0);
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
