import { Client } from "ssh2";

const localPy = "c:/FREZE-PRJ/web-tên-miền/scripts/_patch_lobby_poll.py";
const remotePy = "/tmp/patch_lobby_poll.py";

const after = `
set -e
python3 /tmp/patch_lobby_poll.py
echo '=== grep ==='
grep -n "startLobbyHallPoll\\|startMissedRoundWatch\\|HALL MISS\\|HALL POLL DEAD\\|currentInTable) return" /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js | head -20
echo '=== restart stagger ==='
pm2 restart session_sexy_1 --update-env
sleep 12
pm2 restart session_sexy_2 --update-env
pm2 save
echo done
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
