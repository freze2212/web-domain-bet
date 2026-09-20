import { Client } from "ssh2";
import fs from "fs";
import path from "path";
const root = "c:/FREZE-PRJ/web-tên-miền";
const c = new Client();
c.on("ready", () => {
  c.sftp((err, sftp) => {
    const data = fs.readFileSync(path.join(root, "src/cloudflare.js"));
    const ws = sftp.createWriteStream("/var/www/web-ten-mien/src/cloudflare.js");
    ws.on("close", () => {
      c.exec("pm2 restart web-tenmienbet --update-env && echo OK", (e, s) => {
        let o = "";
        s.on("data", (d) => (o += d));
        s.on("close", () => {
          console.log(o.trim());
          c.end();
        });
      });
    });
    ws.end(data);
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
