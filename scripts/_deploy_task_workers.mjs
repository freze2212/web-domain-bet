import { Client } from "ssh2";
import fs from "fs";

const LOCAL = "c:/FREZE-PRJ/web-tên-miền/src/task-workers.js";
const REMOTE = "/var/www/web-ten-mien/src/task-workers.js";
const content = fs.readFileSync(LOCAL);

const c = new Client();
c.on("ready", () => {
  c.sftp((err, sftp) => {
    if (err) {
      console.error(err);
      c.end();
      process.exit(1);
    }
    const ws = sftp.createWriteStream(REMOTE);
    ws.on("close", () => {
      c.exec("pm2 restart web-tenmienbet --update-env && sleep 2 && pm2 describe web-tenmienbet | head -20", (e2, stream) => {
        let o = "", er = "";
        stream.on("data", (d) => (o += d));
        stream.stderr.on("data", (d) => (er += d));
        stream.on("close", (code) => {
          console.log(o || er);
          console.log("exit", code);
          c.end();
          process.exit(code || 0);
        });
      });
    });
    ws.on("error", (e) => {
      console.error(e);
      c.end();
      process.exit(1);
    });
    ws.end(content);
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
