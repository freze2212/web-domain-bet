import { Client } from "ssh2";
const c = new Client();
c.on("ready", () => {
  c.exec(`
echo '=== DNS ==='
dig +short gg88sk.com A; dig +short gg88sk.com CNAME
echo '=== pages.dev ==='
curl -sI https://lp-gg88-gt9-sk.pages.dev/ | head -3
curl -s https://lp-gg88-gt9-sk.pages.dev/domains.json | head -c 300
echo
echo '=== gg88sk ==='
curl -sI https://gg88sk.com/ --max-time 20 | head -5
sleep 8
curl -sI https://gg88sk.com/ --max-time 20 | head -5
echo '=== domains.json ==='
curl -s https://gg88sk.com/domains.json --max-time 20 | head -c 400
`, (err, s) => {
    let o = "";
    s.on("data", (d) => (o += d));
    s.on("close", () => {
      console.log(o);
      c.end();
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
