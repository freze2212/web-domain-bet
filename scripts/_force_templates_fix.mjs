import { Client } from "ssh2";
import fs from "fs";

const local = fs.readFileSync("c:/FREZE-PRJ/web-tên-miền/src/templates.js", "utf8");
const hasFix = local.includes("origin/master") && local.includes("Không sync được origin trước");
console.log("local has fix", hasFix);

const c = new Client();
c.on("ready", () => {
  c.exec("grep -n 'origin/master\\|Không sync được origin' /var/www/web-ten-mien/src/templates.js | head -20", (e, s) => {
    let o = "";
    s.on("data", (d) => (o += d.toString()));
    s.stderr.on("data", (d) => (o += d.toString()));
    s.on("close", () => {
      console.log("VPS grep:\n", o);
      c.sftp((err, sftp) => {
        if (err) throw err;
        const ws = sftp.createWriteStream("/var/www/web-ten-mien/src/templates.js");
        ws.on("close", () => {
          c.exec("grep -n 'origin/master\\|Không sync được origin' /var/www/web-ten-mien/src/templates.js | head -20; md5sum /var/www/web-ten-mien/src/templates.js", (e2, s2) => {
            let o2 = "";
            s2.on("data", (d) => (o2 += d.toString()));
            s2.stderr.on("data", (d) => (o2 += d.toString()));
            s2.on("close", () => {
              console.log("after upload:\n", o2);
              c.end();
            });
          });
        });
        ws.end(Buffer.from(local, "utf8"));
      });
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
