import { Client } from "ssh2";
import fs from "fs";

const local = "c:/FREZE-PRJ/web-tên-miền/scripts/_switch_7_to_mx_git2_vps.mjs";
const remote = "/var/www/web-ten-mien/scripts/_switch_7_to_mx_git2_vps.mjs";
const content = fs.readFileSync(local);

const c = new Client();
c.on("ready", () => {
  c.sftp((err, sftp) => {
    if (err) throw err;
    const ws = sftp.createWriteStream(remote);
    ws.on("close", () => {
      console.log("uploaded", remote);
      c.exec(
        `pkill -f '_switch_7_to_mx_git2' 2>/dev/null; cd /var/www/web-ten-mien && set -a && . ./.env && set +a && nohup node scripts/_switch_7_to_mx_git2_vps.mjs > /tmp/_switch_mx_7.out 2>&1 & echo PID:$!; sleep 2; head -20 /tmp/_switch_mx_7.log; head -20 /tmp/_switch_mx_7.out`,
        (e2, stream) => {
          let o = "";
          stream.on("data", (d) => (o += d.toString()));
          stream.stderr.on("data", (d) => (o += d.toString()));
          stream.on("close", () => {
            console.log(o);
            c.end();
          });
        }
      );
    });
    ws.end(content);
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
