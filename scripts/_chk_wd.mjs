import { Client } from "ssh2";

const cmd = `
F=/var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js
echo '=== watchdog / lastSessionProgressAt ==='
grep -n "WATCHDOG\\|lastSessionProgressAt\\|không có tiến triển" "$F" | head -40
echo
echo '=== NS2 latest ==='
tail -n 25 /root/.pm2/logs/session-sexy-2-out.log
echo
echo '=== NS1 latest ==='
tail -n 15 /root/.pm2/logs/session-sexy-1-out.log
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
