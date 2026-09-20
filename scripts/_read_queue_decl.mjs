import { Client } from "ssh2";

const cmd = `
F=/var/www/tool-baccarat-v2-scratch-data/server.js
grep -n "hallUpdateQueue\\|SERVER_VERBOSE" "$F" | head
echo '=== around 900 ==='
sed -n '880,950p' "$F"
echo
echo '=== ingest route exact ==='
sed -n '185,200p' "$F"
sed -n '256,280p' "$F"
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
