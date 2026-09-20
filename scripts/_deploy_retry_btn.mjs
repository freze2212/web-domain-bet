import { Client } from "ssh2";
import { readFileSync } from "fs";

const files = [
  ["public/app.js", "/var/www/web-ten-mien/public/app.js"],
  ["src/server.js", "/var/www/web-ten-mien/src/server.js"],
];
const root = "c:/FREZE-PRJ/web-tên-miền/";
const c = new Client();
c.on("ready", () => {
  c.sftp((err, sftp) => {
    if (err) throw err;
    let i = 0;
    const next = () => {
      if (i >= files.length) {
        c.exec("pm2 restart web-tenmienbet --update-env && sleep 2 && grep -n 'retryFailedDeploy\\|Thử Lại' /var/www/web-ten-mien/public/app.js | head -10 && pm2 show web-tenmienbet | grep -E 'status|uptime' | head -5", (e2, s) => {
          let o = "";
          s.on("data", (d) => (o += d.toString()));
          s.stderr.on("data", (d) => (o += d.toString()));
          s.on("close", (code) => {
            console.log(o);
            console.log("exit", code);
            c.end();
          });
        });
        return;
      }
      const [local, remote] = files[i++];
      sftp.writeFile(remote, readFileSync(root + local), (e) => {
        if (e) throw e;
        console.log("OK", local);
        next();
      });
    };
    next();
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
