/**
 * Deploy RBAC flow: ownership sync, domain-orders fulfill, public UI
 */
import fs from "fs";
import path from "node:path";
import { Client } from "ssh2";

const pass = process.env.VPS_PASS || "admin123@!";
const remoteRoot = "/var/www/web-ten-mien";
const root = process.cwd();

const files = [
  "src/server.js",
  "src/ownership.js",
  "src/domain-orders.js",
  "public/app.js",
  "public/index.html",
  "scripts/_backfill_ownership.mjs",
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
      for (const rel of files) {
        const local = path.join(root, rel);
        const base = path.basename(rel);
        await upload(sftp, local, `/tmp/${base}`);
        console.log("UP", rel);
      }

      const mvLines = files
        .map((rel) => {
          const base = path.basename(rel);
          const remoteDir = `${remoteRoot}/${path.dirname(rel).replace(/\\/g, "/")}`;
          return `mkdir -p ${remoteDir}
cp ${remoteRoot}/${rel.replace(/\\/g, "/")} ${remoteRoot}/${rel.replace(/\\/g, "/")}.bak-rbac-$TS 2>/dev/null || true
mv /tmp/${base} ${remoteRoot}/${rel.replace(/\\/g, "/")}`;
        })
        .join("\n");

      const cmd = `
set -e
TS=$(date +%Y%m%d%H%M%S)
${mvLines}
cd ${remoteRoot}
node scripts/_backfill_ownership.mjs || true
pm2 restart web-tenmienbet --update-env
sleep 2
pm2 status web-tenmienbet | head -5
echo DEPLOY_RBAC_OK
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
