import { Client } from "ssh2";
const cmd = `
echo '=== NGINX FILE ==='
cat /etc/nginx/sites-enabled/autotest-6888.top
echo
echo '=== LISTEN 3500 ==='
ss -tlnp | grep -E '3500|nginx' | head -20
echo
echo '=== CURL LOCAL ==='
curl -sI http://127.0.0.1:3500/ | head -15
curl -sI http://127.0.0.1/uploads/ 2>/dev/null | head -10
echo
echo '=== PUBLIC PATHS ==='
curl -sI https://autotest-6888.top/  | head -12
curl -sI https://autotest-6888.top/uploads/ | head -12
curl -sI https://autotest-6888.top/api/files | head -12
ls /var/www/media-vault/public
echo '=== SAMPLE UPLOAD ==='
ls /var/www/media-vault/uploads | head -5
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
