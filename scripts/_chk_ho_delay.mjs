import { Client } from "ssh2";

const cmd = `
export TZ=Asia/Ho_Chi_Minh
date
echo '===== session last 80 ====='
tail -n 80 /root/.pm2/logs/session-sexy-2-out.log
echo
echo '===== session err last 30 ====='
tail -n 30 /root/.pm2/logs/session-sexy-2-error.log
echo
echo '===== bot last 60 ====='
tail -n 60 /root/.pm2/logs/bot-sexy-2-out.log
echo
echo '===== AUTO-RECOVER / WATCHDOG / BLOCK ====='
grep -E 'HALL AUTO-RECOVER|WATCHDOG|BLOCK HÔ|WAIT API|FE SYNC|resetMain|RECOVER|detachStreak|staleMs' /root/.pm2/logs/session-sexy-2-out.log /root/.pm2/logs/session-sexy-2-error.log /root/.pm2/logs/bot-sexy-2-out.log 2>/dev/null | grep '2026-09-13T08:4\|2026-09-13T08:5\|2026-09-13 15:4\|2026-09-13 15:5' | tail -50
`;

const c = new Client();
c.on("ready", () => {
  c.exec(cmd, (e, s) => {
    let o = "";
    s.on("data", (d) => (o += d.toString()));
    s.stderr.on("data", (d) => (o += d.toString()));
    s.on("close", () => {
      console.log(o || "(empty)");
      c.end();
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
