/**
 * Deploy set-link fix files to VPS hub + restart PM2
 */
import fs from "fs";
import { Client } from "ssh2";

for (const line of fs.readFileSync(".env", "utf8").split(/\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const i = t.indexOf("=");
  process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const pass = process.env.VPS_PASS || "admin123@!";
const files = ["src/repo-scanner.js", "src/verifier.js", "src/templates.js"];

function upload(sftp, local, remote) {
  return new Promise((resolve, reject) => {
    const ws = sftp.createWriteStream(remote);
    fs.createReadStream(local).pipe(ws);
    ws.on("close", resolve);
    ws.on("error", reject);
  });
}

const conn = new Client();
conn
  .on("ready", () => {
    conn.sftp(async (err, sftp) => {
      if (err) {
        console.error(err);
        conn.end();
        process.exit(1);
      }
      try {
        for (const f of files) {
          const base = f.split("/").pop();
          await upload(sftp, f, `/tmp/${base}`);
          console.log("uploaded", f);
        }
        const cmd = `
set -e
TS=$(date +%Y%m%d%H%M%S)
cp /var/www/web-ten-mien/src/repo-scanner.js /var/www/web-ten-mien/src/repo-scanner.js.bak-setlink-$TS
cp /var/www/web-ten-mien/src/verifier.js /var/www/web-ten-mien/src/verifier.js.bak-setlink-$TS
cp /var/www/web-ten-mien/src/templates.js /var/www/web-ten-mien/src/templates.js.bak-setlink-$TS
mv /tmp/repo-scanner.js /var/www/web-ten-mien/src/repo-scanner.js
mv /tmp/verifier.js /var/www/web-ten-mien/src/verifier.js
mv /tmp/templates.js /var/www/web-ten-mien/src/templates.js
pm2 restart web-tenmienbet
sleep 3
pm2 show web-tenmienbet | head -20
echo DEPLOY_OK
`;
        conn.exec(cmd, (e2, stream) => {
          if (e2) {
            console.error(e2);
            conn.end();
            process.exit(1);
          }
          stream.on("data", (d) => process.stdout.write(d));
          stream.stderr.on("data", (d) => process.stderr.write(d));
          stream.on("close", (code) => {
            conn.end();
            process.exit(code || 0);
          });
        });
      } catch (e) {
        console.error(e);
        conn.end();
        process.exit(1);
      }
    });
  })
  .on("error", (e) => {
    console.error(e);
    process.exit(1);
  })
  .connect({ host: "103.146.22.218", port: 22, username: "root", password: pass });
