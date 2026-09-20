import { Client } from "ssh2";

const cmd = `
F=/var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js
echo '=== hall helpers ==='
sed -n '40,110p' "$F"
echo
echo '=== ingest + poll ==='
grep -n "function ingestHallTableItems\\|function pollHall\\|function startMissed\\|function startActive\\|lastSessionRequestBase\\|URI_REQUEST_DATA\\|isHallOnly\\|HALL MISS\\|markHallWatch" "$F" | head -40
echo
echo '=== .env URI ==='
grep -n "URI_REQUEST\\|SERVER_PORT\\|DOMAIN" /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/.env | head
echo
echo '=== lobby stay + ingest fn ==='
sed -n '880,910p' "$F"
echo '--- ingest ---'
sed -n '1535,1680p' "$F"
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
