import { Client } from "ssh2";
import { readFileSync } from "fs";

const py = readFileSync("c:/FREZE-PRJ/web-tên-miền/scripts/_patch_hall_main_only.py");

const remote = `
set -e
FILE=/var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js
BAK=$FILE.bak-main-only-$(date +%s)
cp -a "$FILE" "$BAK"
echo BACKUP=$BAK

# ensure helper names exist
grep -n "function waitSeamlessSrcOrHall\\|function bindSeamlessFrame\\|function recoverHallViaLiveLobby\\|function resolveGameHallFrame\\|function waitForGameHall\\|async function resetMain" "$FILE" | head -20

python3 /tmp/_patch_hall_main_only.py
node --check "$FILE"
echo SYNTAX_OK

grep -n "lobby-only\\|startHallOnlyKeepalive\\|skip place bet\\|skip capture\\|skip enterTargetTable" "$FILE" | head -20

# run-ns2 HALL_ONLY only
cat > /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/run-ns2.sh <<'SH'
#!/bin/bash
cd /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main
export ACCOUNT_INDEX=2
export SKIP_BOOT_DELAY=1
export HEADLESS=1
export USE_FIREFOX=1
export HALL_ONLY=1
export DOTENV_CONFIG_PATH=/var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/.env
exec node --max-old-space-size=1024 -r dotenv/config servicePuppeteer/session.js
SH
chmod +x /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/run-ns2.sh
cp -a /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/run-ns2.sh /tmp/run-ns2.sh

# stop tipster bot permanently (save without it)
pm2 delete bot_sexy_2 || true
pm2 restart session_sexy_2 --update-env
pm2 save
echo
pm2 jlist | python3 -c "import sys,json;d=json.load(sys.stdin);print([(p['name'],p['pm2_env']['status']) for p in d])"
sleep 3
tail -n 20 /root/.pm2/logs/session-sexy-2-out.log
`;

const c = new Client();
c.on("ready", () => {
  c.sftp((err, sftp) => {
    if (err) throw err;
    sftp.writeFile("/tmp/_patch_hall_main_only.py", py, (e2) => {
      if (e2) throw e2;
      c.exec(remote, (e3, stream) => {
        let o = "";
        stream.on("data", (d) => (o += d.toString()));
        stream.stderr.on("data", (d) => (o += d.toString()));
        stream.on("close", (code) => {
          console.log(o || "(empty)");
          console.log("EXIT", code);
          c.end();
          process.exit(code || 0);
        });
      });
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
