import { Client } from "ssh2";
import fs from "fs";
const c = new Client();
c.on("ready", () => {
  c.sftp((err, sftp) => {
    const ws = sftp.createWriteStream("/var/www/web-ten-mien/scripts/_fix_88kjc_dns.mjs");
    ws.on("close", () => {
      c.exec("cd /var/www/web-ten-mien && node scripts/_fix_88kjc_dns.mjs", (e, s) => {
        let o = "";
        s.on("data", (d) => (o += d));
        s.stderr.on("data", (d) => (o += d));
        s.on("close", () => {
          console.log(o);
          c.end();
        });
      });
    });
    ws.end(fs.readFileSync("c:/FREZE-PRJ/web-tên-miền/scripts/_fix_88kjc_dns.mjs"));
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
