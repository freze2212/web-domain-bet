import { Client } from "ssh2";

const cmd = `
sed -n '3810,3870p' /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js
echo '===='
# restore bak and re-patch more carefully
BAK=$(ls -1t /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js.bak-main-only-* | head -1)
echo BAK=$BAK
cp -a "$BAK" /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js
echo restored
# show captureTableRound and enterTargetTable and runPlaceBet signatures
grep -n "async function runPlaceBetCommand\\|async function captureTableRound\\|async function enterTargetTable" /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js
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
