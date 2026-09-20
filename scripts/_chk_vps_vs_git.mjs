import { Client } from "ssh2";
import crypto from "crypto";
import fs from "fs";
import path from "path";

const root = "c:/FREZE-PRJ/web-tên-miền";
const files = ["public/app.js", "src/history.js", "src/templates.js"];

function md5(buf) {
  return crypto.createHash("md5").update(buf).digest("hex");
}

const local = Object.fromEntries(
  files.map((f) => [f, md5(fs.readFileSync(path.join(root, f)))])
);

const c = new Client();
c.on("ready", () => {
  c.sftp((err, sftp) => {
    if (err) throw err;
    let left = files.length;
    for (const f of files) {
      const remote = "/var/www/web-ten-mien/" + f;
      sftp.readFile(remote, (e, data) => {
        if (e) console.log("VPS miss", f, e.message);
        else {
          const r = md5(data);
          console.log(
            f,
            local[f] === r ? "MATCH local=VPS" : "DIFF",
            "local=" + local[f].slice(0, 8),
            "vps=" + r.slice(0, 8)
          );
        }
        if (--left === 0) {
          c.exec(
            'grep -o "app.js?v=[^\"]*" /var/www/web-ten-mien/public/index.html; ls -la --time-style=long-iso /var/www/web-ten-mien/public/app.js /var/www/web-ten-mien/src/history.js | awk \'{print $6,$7,$8}\'',
            (ee, s) => {
              let o = "";
              s.on("data", (d) => (o += d));
              s.stderr.on("data", (d) => (o += d));
              s.on("close", () => {
                console.log(o.trim());
                c.end();
              });
            }
          );
        }
      });
    }
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
