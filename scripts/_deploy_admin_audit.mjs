import { Client } from "ssh2";
import fs from "fs";
import path from "path";

const files = [
  "src/admin-audit.js",
  "src/server.js",
  "public/admin-audit.html",
  "public/index.html",
  "scripts/_compare_freze_pages_vs_hub.mjs",
];
const root = "c:/FREZE-PRJ/web-tên-miền";
const remoteRoot = "/var/www/web-ten-mien";

const c = new Client();
c.on("ready", () => {
  c.sftp((err, sftp) => {
    if (err) throw err;
    let i = 0;
    const next = () => {
      if (i >= files.length) {
        c.exec(
          "pm2 restart web-tenmienbet && sleep 2 && cd /var/www/web-ten-mien && node scripts/_compare_freze_pages_vs_hub.mjs",
          (e2, st) => {
            let o = "";
            st.on("data", (d) => (o += d));
            st.stderr.on("data", (d) => (o += d));
            st.on("close", () => {
              console.log(o);
              c.end();
            });
          }
        );
        return;
      }
      const rel = files[i++];
      const local = path.join(root, rel);
      const remote = `${remoteRoot}/${rel}`.replace(/\\/g, "/");
      // ensure scripts dir
      const ws = sftp.createWriteStream(remote);
      ws.on("close", () => {
        console.log("OK", rel);
        next();
      });
      ws.on("error", (e) => {
        console.error(rel, e.message);
        process.exit(1);
      });
      ws.end(fs.readFileSync(local));
    };
    next();
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
