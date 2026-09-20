import { Client } from "ssh2";
import fs from "fs";
import path from "path";

const files = [
  "src/cf-account-guard.js",
  "src/repo-scanner.js",
  "src/task-workers.js",
  "src/server.js",
  "src/verifier.js",
];
const root = "c:/FREZE-PRJ/web-tên-miền";
const remoteRoot = "/var/www/web-ten-mien";

const c = new Client();
c.on("ready", () => {
  c.sftp((err, sftp) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    let i = 0;
    const next = () => {
      if (i >= files.length) {
        c.exec("pm2 restart web-tenmienbet && sleep 2 && echo RESTARTED", (e2, stream) => {
          let o = "";
          stream.on("data", (d) => (o += d));
          stream.on("close", () => {
            console.log(o);
            c.end();
          });
        });
        return;
      }
      const rel = files[i++];
      const local = path.join(root, rel);
      const remote = `${remoteRoot}/${rel}`.replace(/\\/g, "/");
      const data = fs.readFileSync(local);
      const ws = sftp.createWriteStream(remote);
      ws.on("close", () => {
        console.log("OK", rel);
        next();
      });
      ws.on("error", (e) => {
        console.error("FAIL", rel, e.message);
        c.end();
        process.exit(1);
      });
      ws.end(data);
    };
    next();
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
