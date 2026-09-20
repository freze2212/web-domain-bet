import { Client } from "ssh2";

const cmd = `
export TZ=Asia/Ho_Chi_Minh
echo '===== NOW ====='
date
pm2 list
echo
echo '===== session_sexy_2 uptime / restarts ====='
pm2 show session_sexy_2 2>/dev/null | grep -iE 'status|uptime|restart|created|script|pid'
echo
echo '===== PM2 events today afternoon ====='
grep -E '2026-09-13T0[78]:|2026-09-13 1[45]:' /root/.pm2/pm2.log | grep -iE 'session_sexy_2|server_sexy|bot_sexy|Stopping|exited|online|restart' | tail -40
echo
echo '===== session logs 14:50-15:40 ICT ====='
grep -E '2026-09-13T07:5|2026-09-13T08:0|2026-09-13T08:1|2026-09-13T08:2|2026-09-13T08:3|2026-09-13 14:5|2026-09-13 15:' /root/.pm2/logs/session-sexy-2-out.log | grep -iE 'SHUTDOWN|SIGINT|restart|WATCHDOG|SESSION_EXPIRED|CLEAR|BẮT ĐẦU|ĐĂNG NHẬP|IN ROOM|HALL FORWARD|detached|AUTO|cron|schedule|PAUSE|reset' | tail -60
echo
echo '===== err same window ====='
grep -E '2026-09-13T07:5|2026-09-13T08:|2026-09-13 14:5|2026-09-13 15:' /root/.pm2/logs/session-sexy-2-error.log | tail -40
echo
echo '===== cron / timers related ====='
crontab -l 2>/dev/null
ls /etc/cron.d 2>/dev/null
grep -RIn --include='*.sh' --include='*.js' --include='*.service' -E 'restart|session_sexy|cron|schedule|setInterval.*restart' /tmp/run-ns2.sh /var/www/tool-baccarat-v2-scratch-data/scripts 2>/dev/null | head -40
echo
echo '===== last 40 session out ====='
tail -n 40 /root/.pm2/logs/session-sexy-2-out.log
echo
echo '===== last 20 bot ====='
tail -n 20 /root/.pm2/logs/bot-sexy-2-out.log
echo
echo '===== API now ====='
curl -sS -m 5 https://tool.toolbcr79.com/api/get-active-table; echo
curl -sS -m 5 https://tool.toolbcr79.com/api/occupied-tables; echo
`;

const c = new Client();
c.on("ready", () => {
  c.exec(cmd, { pty: true }, (e, s) => {
    let o = "";
    s.on("data", (d) => (o += d.toString()));
    s.stderr.on("data", (d) => (o += d.toString()));
    s.on("close", () => {
      console.log(o || "(empty)");
      c.end();
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
