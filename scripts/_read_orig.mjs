import { Client } from "ssh2";

const cmd = `
BAK=/var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js.bak-hall-recover-1789289241562
echo '=== account index ==='
sed -n '1,60p' "$BAK"
echo
echo '=== AUTO ENTER ==='
grep -n "AUTO ENTER\\|enterTargetTable\\|ingestHallTableItems\\|startActiveTableHeartbeat\\|ACCOUNT_INDEX" "$BAK" | head -25
echo
echo '=== account.puppeteer ==='
sed -n '1,80p' /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/account.puppeteer.js
echo
echo '=== scratch session vs bot-keo size ==='
wc -c /var/www/tool-baccarat-v2-scratch-data/servicePuppeteer/session.js
echo 'scratch ACCOUNT'
grep -n "ACCOUNT_INDEX\\|HALL_ONLY\\|username" /var/www/tool-baccarat-v2-scratch-data/.env 2>/dev/null | head
pm2 env 1 2>/dev/null | grep -E 'ACCOUNT|HALL|NAME' | head
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
