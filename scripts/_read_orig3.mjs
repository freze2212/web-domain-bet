import { Client } from "ssh2";

const cmd = `
BAK=/var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js.bak-hall-recover-1789289241562
echo '=== resetMain ==='
sed -n '4319,4420p' "$BAK"
echo
echo '=== hall network / tableItems / bigRoads ==='
grep -n "tableItems\\|bigRoads\\|stampTime\\|percentCurrent\\|HALL FORWARD\\|ingestHall\\|gameHall\\|GetGameHall\\|requestfinished\\|response" "$BAK" | head -50
echo
echo '=== run-ns2 ==='
cat /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/run-ns2.sh
echo
echo '=== cron hall ==='
crontab -l 2>/dev/null | grep -i hall || true
ls -la /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/hall-supervisor.js /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/run-hall-supervisor.sh 2>/dev/null
echo
echo '=== scratch session.js head ==='
sed -n '1,80p' /var/www/tool-baccarat-v2-scratch-data/servicePuppeteer/session.js
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
