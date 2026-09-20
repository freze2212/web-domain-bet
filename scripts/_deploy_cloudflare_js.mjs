import { Client } from "ssh2";
import fs from "fs";

const local = "c:/FREZE-PRJ/web-tên-miền/src/cloudflare.js";
const remote = "/var/www/web-ten-mien/src/cloudflare.js";
const c = new Client();
c.on("ready", () => {
  c.sftp((err, sftp) => {
    if (err) throw err;
    const ws = sftp.createWriteStream(remote);
    ws.on("close", () => {
      c.exec("pm2 restart web-tenmienbet", (e2, st) => {
        let o = "";
        st.on("data", (d) => (o += d));
        st.on("close", () => {
          console.log(o.slice(0, 400));
          c.end();
        });
      });
    });
    ws.end(fs.readFileSync(local));
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
