import fs from "fs";
import { Client } from "ssh2";

for (const line of fs.readFileSync(".env", "utf8").split(/\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const i = t.indexOf("=");
  process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const pass = process.env.VPS_PASS || "admin123@!";
const GH = process.env.GITHUB_TOKEN;

const conn = new Client();
conn
  .on("ready", () => {
    conn.sftp((err, sftp) => {
      if (err) {
        console.error(err);
        conn.end();
        process.exit(1);
      }
      const rs = fs.createReadStream("src/templates.js");
      const ws = sftp.createWriteStream("/tmp/templates.js");
      rs.pipe(ws);
      ws.on("close", () => {
        const cmd = `
set -e
cp /var/www/web-ten-mien/src/templates.js /var/www/web-ten-mien/src/templates.js.bak-harden-$(date +%Y%m%d%H%M%S)
mv /tmp/templates.js /var/www/web-ten-mien/src/templates.js
if grep -q '^GITHUB_TOKEN=' /var/www/web-ten-mien/.env; then
  sed -i 's|^GITHUB_TOKEN=.*|GITHUB_TOKEN=${GH}|' /var/www/web-ten-mien/.env
else
  echo 'GITHUB_TOKEN=${GH}' >> /var/www/web-ten-mien/.env
fi
printf 'machine github.com\\nlogin x-access-token\\npassword %s\\n' '${GH}' > /root/.netrc
chmod 600 /root/.netrc
pm2 restart web-tenmienbet
sleep 2
echo HUB_OK
git -C /var/www/Landingpages/GG88/ldpape_4d-5-quocgia rev-parse --is-inside-work-tree
git -C /var/www/Landingpages/GG88/ldpape_4d rev-parse --is-inside-work-tree
`;
        conn.exec(cmd, (e2, stream) => {
          if (e2) {
            console.error(e2);
            conn.end();
            process.exit(1);
          }
          stream.on("data", (d) => process.stdout.write(d));
          stream.stderr.on("data", (d) => process.stderr.write(d));
          stream.on("close", (c) => {
            conn.end();
            process.exit(c || 0);
          });
        });
      });
    });
  })
  .on("error", (e) => {
    console.error(e.message);
    process.exit(1);
  })
  .connect({ host: "103.146.22.218", username: "root", password: pass, readyTimeout: 30000 });
