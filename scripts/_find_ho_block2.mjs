import { Client } from "ssh2";

const cmd = `
cat /tmp/run-bot-ns2.sh
echo '===='
# find bot main
BOTDIR=$(dirname $(readlink -f /tmp/run-bot-ns2.sh 2>/dev/null) 2>/dev/null || true)
head -20 /tmp/run-bot-ns2.sh
echo
# search wider
grep -rn "không phải ảnh capture\\|HÔ BLOCK\\|capture thật" /var/www --include='*.js' 2>/dev/null | head -30
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
