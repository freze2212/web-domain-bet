import { Client } from "ssh2";

const localPy = "c:/FREZE-PRJ/web-tên-miền/scripts/_patch_ingest_fast.py";
const remotePy = "/tmp/patch_ingest_fast.py";
const after = `
set -e
python3 /tmp/patch_ingest_fast.py
echo '=== session bits ==='
grep -n "HALL SKIP\\|HALL INGEST SLOW\\|timeout: 4000\\|poll sảnh mỗi 1s" /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js | head
echo '=== server bits ==='
grep -n "latestHallPayload\\|lastBrowserIngestAt\\|queued: true" /var/www/tool-baccarat-v2-scratch-data/server.js | head
echo '=== restart ==='
pm2 restart server_sexy --update-env
sleep 4
pm2 restart session_sexy_1 --update-env
sleep 10
pm2 restart session_sexy_2 --update-env
pm2 save
echo DONE
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
