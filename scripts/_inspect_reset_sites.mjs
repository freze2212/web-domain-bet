import { Client } from "ssh2";

const cmd = `
FILE=/var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js
echo '=== 930-970 ==='
sed -n '930,970p' "$FILE"
echo '=== 1210-1250 ==='
sed -n '1210,1250p' "$FILE"
echo '=== 3190-3240 ==='
sed -n '3190,3240p' "$FILE"
echo '=== 4168-4220 ==='
sed -n '4168,4220p' "$FILE"
echo '=== resetMain fn ==='
sed -n '4535,4590p' "$FILE"
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
