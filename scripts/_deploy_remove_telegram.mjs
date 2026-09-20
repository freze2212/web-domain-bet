/**
 * Gỡ Telegram bot khỏi VPS — chỉ giữ web hub
 */
import fs from "fs";
import path from "node:path";
import { Client } from "ssh2";

const pass = process.env.VPS_PASS || "admin123@!";
const remoteRoot = "/var/www/web-ten-mien";
const root = process.cwd();

const uploadFiles = [
  "src/server.js",
  "src/app.js",
  "public/index.html",
  "package.json",
];

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
      for (const rel of uploadFiles) {
        const base = path.basename(rel);
        await upload(sftp, path.join(root, rel), `/tmp/${base}`);
        console.log("UP", rel);
      }

      const mvLines = uploadFiles
        .map((rel) => {
          const base = path.basename(rel);
          const remotePath = `${remoteRoot}/${rel.replace(/\\/g, "/")}`;
          return `cp ${remotePath} ${remotePath}.bak-notg-$TS 2>/dev/null || true
mv /tmp/${base} ${remotePath}`;
        })
        .join("\n");

      const cmd = `
set -e
TS=$(date +%Y%m%d%H%M%S)
${mvLines}
rm -f ${remoteRoot}/src/bot.js
rm -rf ${remoteRoot}/backend/src/telegram 2>/dev/null || true
if grep -q '^TELEGRAM_BOT_TOKEN=' ${remoteRoot}/.env 2>/dev/null; then
  sed -i '/^TELEGRAM_BOT_TOKEN=/d' ${remoteRoot}/.env
fi
if grep -q '^TELEGRAM_CHAT_ID=' ${remoteRoot}/.env 2>/dev/null; then
  sed -i '/^TELEGRAM_CHAT_ID=/d' ${remoteRoot}/.env
fi
pm2 delete telegram-bot 2>/dev/null || true
pm2 delete web-tenmien-bot 2>/dev/null || true
pm2 restart web-tenmienbet --update-env
sleep 2
test ! -f ${remoteRoot}/src/bot.js && echo BOT_REMOVED_OK
pm2 status web-tenmienbet | head -5
echo DEPLOY_NO_TELEGRAM_OK
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
