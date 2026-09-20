import { Client } from "ssh2";

const cmd = `
F=/var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js
echo '=== watchdog body ==='
sed -n '1275,1320p' "$F"
echo
echo '=== progress updates context ==='
sed -n '350,410p' "$F"
echo '---'
sed -n '1425,1450p' "$F"
echo '---'
sed -n '1574,1590p' "$F"
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
