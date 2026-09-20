import { Client } from "ssh2";

const cmd = `
sed -n '1455,1620p' /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js
echo '===== HEARTBEAT CALL poll? ====='
grep -n 'pollHall\\|ingestHall\\|HallInTable\\|pollInTable\\|startActiveTableHeartbeat\\|lastHallIngestAt' /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js | head -60
echo '===== 1265-1310 watchdog ====='
sed -n '1265,1310p' /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js
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
