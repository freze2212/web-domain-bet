import fs from "fs";
import { Client } from "ssh2";
const local = "c:/FREZE-PRJ/web-tên-miền/src/cloudflare.js";
const remote = "/var/www/web-ten-mien/src/cloudflare.js";
const c = new Client();
c.on("ready", () => {
  c.sftp((err, sftp) => {
    if (err) throw err;
    sftp.writeFile(remote, fs.readFileSync(local), (e) => {
      if (e) throw e;
      c.exec(
        `pm2 restart web-tenmienbet --update-env; sleep 2; cd /var/www/web-ten-mien && node --input-type=module -e '
import { forceDeployPagesProject } from "./src/cloudflare.js";
const r = await forceDeployPagesProject("lp-gg88-vip-9", "/var/www/Landingpages/GG88/ldpape_4d");
console.log(JSON.stringify(r));
'`,
        (e2, s) => {
          let o = "";
          s.on("data", (d) => (o += d));
          s.stderr.on("data", (d) => (o += d));
          s.on("close", () => {
            console.log(o);
            c.end();
          });
        }
      );
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
