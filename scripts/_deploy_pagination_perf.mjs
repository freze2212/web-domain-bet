import { Client } from "ssh2";
import fs from "fs";
import path from "path";

const root = "c:/FREZE-PRJ/web-tên-miền";
const files = [
  "src/server.js",
  "src/domains-list-service.js",
  "src/repo-scanner.js",
  "public/app.js",
  "public/index.html",
  "public/style.css",
];

const c = new Client();
c.on("ready", () => {
  c.sftp((err, sftp) => {
    if (err) throw err;
    let i = 0;
    const next = () => {
      if (i >= files.length) {
        c.exec("pm2 restart web-tenmienbet --update-env && echo DEPLOY_OK", (e, s) => {
          let o = "";
          s.on("data", (d) => (o += d));
          s.on("close", () => {
            console.log(o.trim());
            c.end();
          });
        });
        return;
      }
      const rel = files[i++];
      const data = fs.readFileSync(path.join(root, rel));
      const ws = sftp.createWriteStream(`/var/www/web-ten-mien/${rel}`);
      ws.on("close", () => {
        console.log("OK", rel);
        next();
      });
      ws.end(data);
    };
    next();
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
