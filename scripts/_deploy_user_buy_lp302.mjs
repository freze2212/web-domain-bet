import fs from "fs";
import path from "path";
import { Client } from "ssh2";

const root = "c:/FREZE-PRJ/web-tên-miền";
const files = [
  ["public/app.js", "/var/www/web-ten-mien/public/app.js"],
  ["public/index.html", "/var/www/web-ten-mien/public/index.html"],
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
    c.end();
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
