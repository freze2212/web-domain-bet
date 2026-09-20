import { Client } from "ssh2";

const cmd = `
F=/var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js
sed -n '1478,1590p' "$F"
echo
echo '=== handleResponse hall if ==='
sed -n '530,590p' "$F"
echo
echo '=== activeTableHeartbeatTimer decl ==='
grep -n "activeTableHeartbeatTimer\\|lobbyPoll" "$F" | head
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
