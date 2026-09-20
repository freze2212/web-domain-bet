import fs from "fs";
import path from "path";
import { Client } from "ssh2";

const root = "c:/FREZE-PRJ/web-tên-miền";
const files = [
  ["public/index.html", "/var/www/web-ten-mien/public/index.html"],
  ["public/app.js", "/var/www/web-ten-mien/public/app.js"],
  ["src/server.js", "/var/www/web-ten-mien/src/server.js"],
];

function put(sftp, local, remote) {
  return new Promise((resolve, reject) => {
    sftp.writeFile(remote, fs.readFileSync(path.join(root, local)), (err) =>
      err ? reject(err) : resolve(remote)
    );
  });
}

const c = new Client();
c.on("ready", () => {
  c.sftp(async (err, sftp) => {
    if (err) throw err;
    for (const [l, r] of files) {
      await put(sftp, l, r);
      console.log("OK", r);
    }
    c.exec("pm2 restart web-tenmienbet --update-env", (e, s) => {
      let o = "";
      s.on("data", (d) => (o += d));
      s.stderr.on("data", (d) => (o += d));
      s.on("close", () => {
        console.log(o);
        c.end();
      });
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
