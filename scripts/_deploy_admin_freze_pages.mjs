/**
 * Upload Admin↔Freze Pages wiring files to VPS and restart PM2.
 */
import { Client } from "ssh2";
import fs from "node:fs";
import path from "node:path";

const FILES = [
  "src/config.js",
  "src/cloudflare.js",
  "src/cf-account-guard.js",
  "src/link-resolve.js",
  "src/server.js",
  ".env.example",
];

const host = "103.146.22.218";
const remoteDir = "/var/www/web-ten-mien";
const conn = new Client();

function upload(sftp, localRel) {
  return new Promise((resolve, reject) => {
    const local = path.resolve(localRel);
    const remote = `${remoteDir}/${localRel.replace(/\\/g, "/")}`;
    const dir = remote.slice(0, remote.lastIndexOf("/"));
    sftp.mkdir(dir, { mode: 0o755 }, () => {
      sftp.fastPut(local, remote, (err) => (err ? reject(err) : resolve(remote)));
    });
  });
}

conn
  .on("ready", () => {
    conn.sftp(async (err, sftp) => {
      if (err) {
        console.error(err);
        conn.end();
        process.exit(1);
      }
      try {
        for (const f of FILES) {
          if (!fs.existsSync(f)) {
            console.warn("SKIP missing", f);
            continue;
          }
          const r = await upload(sftp, f);
          console.log("UP", r);
        }
        conn.exec(
          `cd ${remoteDir} && grep -q CLOUDFLARE_ADMIN_API_TOKEN .env || echo 'CLOUDFLARE_ADMIN_API_TOKEN=' >> .env; grep -q CLOUDFLARE_ADMIN_ACCOUNT_ID .env || echo 'CLOUDFLARE_ADMIN_ACCOUNT_ID=ddead9accc534c1eb074d2a46fffe748' >> .env; pm2 restart web-tenmienbet && sleep 2 && pm2 show web-tenmienbet | head -n 15`,
          (e2, stream) => {
            if (e2) {
              console.error(e2);
              conn.end();
              process.exit(1);
            }
            stream.on("data", (d) => process.stdout.write(d.toString()));
            stream.stderr.on("data", (d) => process.stderr.write(d.toString()));
            stream.on("close", (code) => {
              conn.end();
              process.exit(code || 0);
            });
          }
        );
      } catch (e) {
        console.error(e);
        conn.end();
        process.exit(1);
      }
    });
  })
  .connect({ host, username: "root", password: "admin123@!" });
