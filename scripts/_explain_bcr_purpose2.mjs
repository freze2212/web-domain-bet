import { Client } from "ssh2";

const cmd = `
cd /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main
echo '=== ingest-hall-data handler ==='
sed -n '256,340p' server.js
echo
echo '=== session comment near hall forward / purpose ==='
grep -n "ingestHall\\|HALL FORWARD\\|emit.*hall\\|socket.emit\\|queryWebGameHall" servicePuppeteer/session.js | head -25
echo
echo '=== FE static elsewhere? ==='
find /var/www -maxdepth 3 -type d -name '*baccarat*' 2>/dev/null | head
ls /var/www/tool-baccarat-v2-scratch-data 2>/dev/null | head -20
# nginx root for tool.toolbcr79.com
grep -R "toolbcr79\\|3201\\|tool-baccarat" /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null | head -20
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
