/**
 * Deploy public wallet UI fix + disable ALLOW_SIMULATE_PAY on VPS
 */
import fs from "fs";
import { Client } from "ssh2";

const pass = process.env.VPS_PASS || "admin123@!";

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
      if (err) throw err;
      await upload(sftp, "public/app.js", "/tmp/app.js");
      await upload(sftp, "public/index.html", "/tmp/index.html");
      const cmd = `
set -e
TS=$(date +%Y%m%d%H%M%S)
cp /var/www/web-ten-mien/public/app.js /var/www/web-ten-mien/public/app.js.bak-wallet-$TS
cp /var/www/web-ten-mien/public/index.html /var/www/web-ten-mien/public/index.html.bak-wallet-$TS
mv /tmp/app.js /var/www/web-ten-mien/public/app.js
mv /tmp/index.html /var/www/web-ten-mien/public/index.html
# Tắt simulate-pay trên production (nút mint xu giả)
if grep -q '^ALLOW_SIMULATE_PAY=' /var/www/web-ten-mien/.env; then
  sed -i 's/^ALLOW_SIMULATE_PAY=.*/ALLOW_SIMULATE_PAY=false/' /var/www/web-ten-mien/.env
else
  echo 'ALLOW_SIMULATE_PAY=false' >> /var/www/web-ten-mien/.env
fi
grep '^ALLOW_SIMULATE_PAY=' /var/www/web-ten-mien/.env
pm2 restart web-tenmienbet --update-env
sleep 2
echo DEPLOY_WALLET_OK
`;
      conn.exec(cmd, (e2, stream) => {
        if (e2) throw e2;
        stream.on("data", (d) => process.stdout.write(d));
        stream.stderr.on("data", (d) => process.stderr.write(d));
        stream.on("close", (code) => {
          conn.end();
          process.exit(code || 0);
        });
      });
    });
  })
  .connect({ host: "103.146.22.218", username: "root", password: pass });
