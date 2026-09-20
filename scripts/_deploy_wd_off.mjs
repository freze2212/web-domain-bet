import { Client } from "ssh2";
import { readFileSync } from "fs";

const py = readFileSync("c:/FREZE-PRJ/web-tên-miền/scripts/_patch_wd_off_hallonly.py");
const remote = `
set -e
FILE=/var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js
cp -a "$FILE" "$FILE.bak-wd-off-$(date +%s)"
python3 /tmp/_patch_wd_off_hallonly.py
node --check "$FILE"
echo SYNTAX_OK
grep -n "watchdog skip\\|HALL_ONLY: không để watchdog\\|ignore force_reenter\\|ignore .*_restart\\|always progress\\|Auto Logout Relay" "$FILE" | head
pm2 restart session_sexy_2 --update-env
echo restarted
`;

const c = new Client();
c.on("ready", () => {
  c.sftp((err, sftp) => {
    if (err) throw err;
    sftp.writeFile("/tmp/_patch_wd_off_hallonly.py", py, (e2) => {
      if (e2) throw e2;
      c.exec(remote, (e3, stream) => {
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
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
