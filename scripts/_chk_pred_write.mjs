import { Client } from "ssh2";

const cmd = `
echo '=== helperGameSexy predict write ==='
grep -n "predict\\|prediction\\|aiPredict\\|guess\\|betSide\\|PLAYER\\|BANKER\\|totalRound" /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/utilities/helperGameSexy.js | head -60
echo
echo '=== checkAndUpdateDatabase core ==='
sed -n '140,280p' /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/utilities/helperGameSexy.js
echo '======= 280-380 ======='
sed -n '280,380p' /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/utilities/helperGameSexy.js
echo
echo '=== FE history (public) ==='
grep -rn "DỰ ĐOÁN\\|predictSide\\|history" /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main --include='*.html' --include='*.js' --include='*.vue' 2>/dev/null | grep -v node_modules | head -30
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
