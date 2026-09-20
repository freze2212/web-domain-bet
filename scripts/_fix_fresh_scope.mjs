import { Client } from "ssh2";

const cmd = `
FILE=/var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js
echo '=== lastHallFreshAt decl ==='
grep -n "lastHallFreshAt" "$FILE" | head -20
echo
sed -n '40,55p' "$FILE"
echo
sed -n '1500,1540p' "$FILE"
echo
sed -n '1690,1725p' "$FILE"
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
