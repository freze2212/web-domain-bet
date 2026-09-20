import { Client } from "ssh2";

const cmd = `
echo '=== recoverHallViaLiveLobby ==='
sed -n '1049,1145p' /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js
echo
echo '=== waitSeamless / clickSexyPlay ==='
grep -n "function clickSexyPlay\\|không click play\\|iframe còn blank\\|async function recoverHall" /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js
echo
sed -n '980,1048p' /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js
echo
echo '=== last 20 out ==='
tail -n 20 /root/.pm2/logs/session-sexy-2-out.log
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
