import { Client } from "ssh2";
import fs from "fs";

const files = [
  ["c:/FREZE-PRJ/web-tên-miền/src/cloudflare.js", "/var/www/web-ten-mien/src/cloudflare.js"],
  ["c:/FREZE-PRJ/web-tên-miền/scripts/_repair_pages_binding.mjs", "/var/www/web-ten-mien/scripts/_repair_pages_binding.mjs"],
];

const c = new Client();
c.on("ready", () => {
  c.sftp((err, sftp) => {
    if (err) throw err;
    let i = 0;
    const next = () => {
      if (i >= files.length) {
        c.exec("cd /var/www/web-ten-mien && pm2 restart web-tenmienbet && sleep 2 && node scripts/_repair_pages_binding.mjs 88kjc.dev", (e, s) => {
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
        return;
      }
      const [local, remote] = files[i++];
      const ws = sftp.createWriteStream(remote);
      ws.on("close", () => {
        console.log("OK", remote);
        next();
      });
      ws.end(fs.readFileSync(local));
    };
    next();
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
