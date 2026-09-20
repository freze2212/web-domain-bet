import { Client } from "ssh2";
import fs from "node:fs";
import path from "node:path";

const FILES = [
  "src/repo-scanner.js",
  "src/cf-account-guard.js",
  "src/cloudflare.js",
  "src/config.js",
  "src/server.js",
  "src/link-resolve.js",
  "scripts/sync_all_cf_zones.js",
  "data/cf_zones_cache.json",
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
          const r = await upload(sftp, f);
          console.log("UP", r);
        }
        conn.exec(
          `cd ${remoteDir} && pm2 restart web-tenmienbet && sleep 2 && node -e "import('./src/repo-scanner.js').then(m=>{const a=m.listAllDomains(); const h=a.find(d=>d.domain==='ll886.us'); console.log('count',a.length,'ll886',!!h,h&&h.primaryFolder);})"`,
          (e2, stream) => {
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
