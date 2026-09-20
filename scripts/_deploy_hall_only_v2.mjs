import { Client } from "ssh2";
import { readFileSync } from "fs";

const py = readFileSync("c:/FREZE-PRJ/web-tên-miền/scripts/_patch_hall_only_v2.py");

const remote = `
set -e
FILE=/var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js
BAK=$FILE.bak-hall-only-v2-$(date +%s)
cp -a "$FILE" "$BAK"
echo BACKUP=$BAK
python3 /tmp/_patch_hall_only_v2.py
node --check "$FILE"
echo SYNTAX_OK
grep -n "track=\\|HALL_TRACK_TABLE\\|axios.post(url\\|stay lobby" "$FILE" | head -25

# ensure track table env
grep -q HALL_TRACK_TABLE /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/run-ns2.sh || sed -i '/HALL_ONLY=1/a export HALL_TRACK_TABLE=C03' /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/run-ns2.sh
cp -a /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/run-ns2.sh /tmp/run-ns2.sh
cat /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/run-ns2.sh

pm2 restart session_sexy_2 --update-env
sleep 2
pm2 show session_sexy_2 | head -25
`;

const c = new Client();
c.on("ready", () => {
  c.sftp((err, sftp) => {
    if (err) throw err;
    sftp.writeFile("/tmp/_patch_hall_only_v2.py", py, (e2) => {
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
