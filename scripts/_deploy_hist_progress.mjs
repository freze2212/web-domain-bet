import { Client } from "ssh2";
import fs from "node:fs";
import path from "node:path";

const FILES = [
  "src/history.js",
  "src/repo-scanner.js",
  "src/server.js",
  "src/task-workers.js",
  "public/app.js",
];

const host = "103.146.22.218";
const remoteDir = "/var/www/web-ten-mien";
const conn = new Client();

function upload(sftp, localRel) {
  return new Promise((resolve, reject) => {
    sftp.fastPut(path.resolve(localRel), `${remoteDir}/${localRel.replace(/\\/g, "/")}`, (err) =>
      err ? reject(err) : resolve(localRel)
    );
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
          console.log("UP", await upload(sftp, f));
        }
        conn.exec(`cd ${remoteDir} && pm2 restart web-tenmienbet --update-env`, (e2, stream) => {
          stream.on("data", (d) => process.stdout.write(d.toString()));
          stream.stderr.on("data", (d) => process.stderr.write(d.toString()));
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
  .connect({ host, username: "root", password: "admin123@!" });
