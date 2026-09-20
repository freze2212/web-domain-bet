import { Client } from "ssh2";
const cmd = `
grep -n 'media-grid\\|media-card\\|thumb\\|preview\\|object-fit\\|width:\\|img\\|video' /var/www/media-vault/public/style.css | head -80
echo '==== APP RENDER ===='
grep -n 'media-card\\|innerHTML\\|img\\|video\\|thumb\\|preview' /var/www/media-vault/public/app.js | head -60
echo '==== CSS TAIL media ===='
grep -n 'media-' /var/www/media-vault/public/style.css
sed -n '250,450p' /var/www/media-vault/public/style.css
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
