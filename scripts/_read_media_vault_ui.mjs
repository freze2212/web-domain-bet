import { Client } from "ssh2";
const cmd = `
sed -n '1,200p' /var/www/media-vault/public/index.html
echo '==== CSS ===='
sed -n '1,250p' /var/www/media-vault/public/style.css
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
