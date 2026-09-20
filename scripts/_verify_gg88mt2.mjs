import { Client } from "ssh2";

const cmd = `
set -a; . /var/www/web-ten-mien/.env; set +a
curl -sS "https://api.cloudflare.com/client/v4/zones?name=gg88mt.com" -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" | python3 -c 'import sys,json;j=json.load(sys.stdin);z=j["result"][0]; print(z["status"], z["name_servers"])'
echo '=== curl -L follow ==='
curl -sI --max-time 25 http://gg88mt.com/ 2>&1 | head -20
echo '---'
curl -sI --max-time 25 https://gg88mt.com/ 2>&1 | head -20
echo '--- www ---'
curl -sI --max-time 25 https://www.gg88mt.com/ 2>&1 | head -15
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
