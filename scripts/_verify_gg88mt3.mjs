import { Client } from "ssh2";

const cmd = `
echo '=== A records ==='
dig +short gg88mt.com A @1.1.1.1
dig +short www.gg88mt.com A @1.1.1.1
echo '=== curl verbose http ==='
curl -sv --max-time 20 -o /dev/null http://gg88mt.com/ 2>&1 | tail -30
echo '=== curl verbose https ==='
curl -sv --max-time 20 -o /dev/null https://gg88mt.com/ 2>&1 | tail -30
# wait a bit and recheck zone
sleep 15
set -a; . /var/www/web-ten-mien/.env; set +a
curl -sS "https://api.cloudflare.com/client/v4/zones?name=gg88mt.com" -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" | python3 -c 'import sys,json;j=json.load(sys.stdin);z=j["result"][0]; print("zone", z["status"])'
curl -sI --max-time 20 https://gg88mt.com/ 2>&1 | head -20
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
