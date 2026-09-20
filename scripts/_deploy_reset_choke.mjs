import { Client } from "ssh2";
import { readFileSync } from "fs";

const py = readFileSync("c:/FREZE-PRJ/web-tên-miền/scripts/_patch_reset_choke.py");
const remote = `
set -e
FILE=/var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js
cp -a "$FILE" "$FILE.bak-choke-$(date +%s)"
python3 /tmp/_patch_reset_choke.py
node --check "$FILE"
echo SYNTAX_OK
grep -n "block resetMain\\|ignore FATAL UI\\|__allowHallOnlyReset" "$FILE" | head
# confirm runner
grep HALL_ONLY /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/run-ns2.sh
pm2 restart session_sexy_2 --update-env
pm2 save
echo restarted
`;

const c = new Client();
c.on("ready", () => {
  c.sftp((err, sftp) => {
    if (err) throw err;
    sftp.writeFile("/tmp/_patch_reset_choke.py", py, (e2) => {
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
