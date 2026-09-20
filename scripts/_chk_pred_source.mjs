import { Client } from "ssh2";

const cmd = `
FILE=/var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/server.js
echo '=== enqueueHallUpdate ==='
sed -n '185,255p' $FILE
echo
echo '=== predict write / SESSION_LIST ==='
grep -n "predictResultSchema\\|SESSION_LIST\\|insertMany\\|create(\\|prediction\\|aiPredict\\|savePredict" $FILE | head -40
echo
echo '=== watchdog + keepalive current ==='
sed -n '1288,1345p' /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js
echo '--- keepalive ---'
sed -n '1635,1720p' /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js
echo
echo '=== reset callers around 4000-4150 ==='
sed -n '4025,4160p' /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js
echo
echo '=== err last 8 ==='
tail -n 8 /root/.pm2/logs/session-sexy-2-error.log
echo
echo '=== last 25 out ==='
tail -n 25 /root/.pm2/logs/session-sexy-2-out.log
echo
echo '=== FE history field names ==='
find /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main /var/www/tool-baccarat-v2-scratch-data -name '*.js' -o -name '*.html' -o -name '*.vue' 2>/dev/null | head -5
grep -rn "LỊCH SỬ\\|DỰ ĐOÁN\\|predictResult" /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main --include='*.js' --include='*.html' --include='*.vue' 2>/dev/null | head -25
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
