import { Client } from "ssh2";
const cmd = `
pm2 show web-tenmienbet 2>/dev/null | head -40
echo '---'
ss -tlnp 2>/dev/null | head -40
echo '---'
grep -E 'dang chay|localhost|PORT' /root/.pm2/logs/web-tenmienbet-out.log 2>/dev/null | tail -15
`;
const c = new Client();
c.on("ready", () => {
  c.exec(cmd, (e, s) => {
    let o = "";
    s.on("data", (d) => (o += d));
    s.stderr.on("data", (d) => (o += d));
    s.on("close", () => {
      console.log(o);
      c.end();
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
