import { Client } from "ssh2";
import fs from "fs";

const local = "c:/FREZE-PRJ/web-tên-miền/scripts/_fix_88kjc.mjs";
const remote = "/var/www/web-ten-mien/scripts/_fix_88kjc.mjs";
const content = fs.readFileSync(local);

const c = new Client();
c.on("ready", () => {
  c.sftp((err, sftp) => {
    if (err) throw err;
    const ws = sftp.createWriteStream(remote);
    ws.on("close", () => {
      c.exec(`cd /var/www/web-ten-mien && node scripts/_fix_88kjc.mjs`, (e2, s) => {
        let o = "",
          er = "";
        s.on("data", (d) => (o += d));
        s.stderr.on("data", (d) => (er += d));
        s.on("close", (code) => {
          if (er) console.error(er);
          console.log(o);
          console.log("exit", code);
          c.end();
          process.exit(code || 0);
        });
      });
    });
    ws.end(content);
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
