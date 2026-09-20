import { Client } from "ssh2";

const cmd = `
export TZ=Asia/Ho_Chi_Minh
date
pm2 pid session_sexy_2; pm2 show session_sexy_2 | grep -E 'status|uptime|restarts|script'
echo
echo '=== last 60 out ==='
tail -n 60 /root/.pm2/logs/session-sexy-2-out.log
echo
echo '=== last 20 err ==='
tail -n 20 /root/.pm2/logs/session-sexy-2-error.log
echo
# show poll function snippet
sed -n '1510,1600p' /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js
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
