import { Client } from "ssh2";
import { readFileSync } from "fs";

const localPy = "c:/FREZE-PRJ/web-tên-miền/scripts/_patch_hall_only.py";
const py = readFileSync(localPy);

const remoteSh = `
set -e
FILE=/var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js
# if previous partial left helper only, restore first
if grep -q 'function isHallOnlyMode' "$FILE" && ! grep -q 'stay lobby' "$FILE"; then
  BAK=$(ls -1t $FILE.bak-hall-only-* 2>/dev/null | head -1)
  if [ -n "$BAK" ]; then cp -a "$BAK" "$FILE"; echo RESTORED=$BAK; fi
fi
BAK2=$FILE.bak-hall-only-$(date +%s)
cp -a "$FILE" "$BAK2"
echo BACKUP=$BAK2
python3 /tmp/_patch_hall_only.py
node --check "$FILE"
echo SYNTAX_OK
grep -n "isHallOnlyMode\\|HALL ONLY\\|HALL POLL LOBBY\\|AUTO ENTER" "$FILE" | head -30

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
chmod +x /tmp/run-ns2.sh

pm2 delete session_sexy_2 || true
pm2 start /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/run-ns2.sh --name session_sexy_2 --interpreter bash
pm2 save
sleep 3
pm2 show session_sexy_2 | head -30
echo '--- early ---'
tail -n 25 /root/.pm2/logs/session-sexy-2-out.log
`;

const c = new Client();
c.on("ready", () => {
  c.sftp((err, sftp) => {
    if (err) throw err;
    sftp.writeFile("/tmp/_patch_hall_only.py", py, (e2) => {
      if (e2) throw e2;
      c.exec(remoteSh, (e3, stream) => {
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
