import { Client } from "ssh2";

const cmd = `
BAK=/var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js.bak-hall-recover-1789289241562
echo '=== handleResponse hall+session ==='
sed -n '450,580p' "$BAK"
echo
echo '=== capture / notify / lastCaptured ==='
sed -n '140,200p' "$BAK"
echo
echo '=== captureScreenshot def ==='
grep -n "async function capture\\|function capture\\|notify-screenshot\\|isCapturingScreenshot\\|consecutiveCapture" "$BAK" | head -20
echo
echo '=== crontab ==='
crontab -l
echo
echo '=== bot-keo .env accounts (no secrets dump full) ==='
grep -n "^USERNAME_ACCOUNT\\|^ACCOUNT_INDEX\\|^SERVER_PORT\\|^SERVER_HOSTNAME" /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/.env
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
