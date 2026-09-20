import fs from "fs";
import { Client } from "ssh2";

const local = "c:/FREZE-PRJ/web-tên-miền/src/templates.js";
const remote = "/var/www/web-ten-mien/src/templates.js";
const content = fs.readFileSync(local);

const c = new Client();
c.on("ready", () => {
  c.sftp((err, sftp) => {
    if (err) throw err;
    const ws = sftp.createWriteStream(remote);
    ws.on("close", () => {
      c.exec("pm2 restart web-tenmienbet --update-env; sleep 2; grep -n 'ladpage_3f_nhannhan' /var/www/web-ten-mien/src/templates.js || echo REMOVED_OK", (e, s) => {
        let o = "";
        s.on("data", (d) => (o += d));
        s.stderr.on("data", (d) => (o += d));
        s.on("close", () => {
          console.log(o);
          c.end();
        });
      });
    });
    ws.on("error", (e) => {
      console.error(e);
      c.end();
    });
    ws.end(content);
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
