import { Client } from "ssh2";

const cmd = `
FILE=/var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js
echo '=== ingest + keepalive stale checks ==='
sed -n '1488,1525p' "$FILE"
echo '--- keepalive tick ---'
sed -n '1645,1760p' "$FILE"
echo
echo '=== filterData / tableItems shape hint ==='
grep -n "stampTime\\|bigRoads\\|tableInfo" /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/utilities/helperGameSexy.js | head -20
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
