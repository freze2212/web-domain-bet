import { Client } from "ssh2";

const cmd = `
echo '=== run-ns2.sh ==='
cat /tmp/run-ns2.sh
echo
echo '=== session snippet 820-920 ==='
sed -n '820,920p' /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js
echo
echo '=== session snippet 1455-1575 ==='
sed -n '1455,1575p' /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js
echo
echo '=== session snippet 3400-3480 ==='
sed -n '3400,3480p' /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js
echo
echo '=== HALL FORWARD success path ==='
sed -n '450,520p' /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js
echo
echo '=== env nameService NS2 ==='
grep -n "nameServiceSocket\\|NAME_SERVICE\\|NS2\\|process.env" /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js | head -40
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
