import { Client } from "ssh2";
import fs from "fs";

const sh = fs.readFileSync("c:/FREZE-PRJ/web-tên-miền/scripts/_run_mx7.sh");
const js = fs.readFileSync("c:/FREZE-PRJ/web-tên-miền/scripts/_switch_7_to_mx_git2_vps.mjs");
const tpl = fs.readFileSync("c:/FREZE-PRJ/web-tên-miền/src/templates.js");

const c = new Client();
c.on("ready", () => {
  c.sftp((err, sftp) => {
    if (err) throw err;
    const ups = [
      ["/tmp/_run_mx7.sh", sh],
      ["/var/www/web-ten-mien/scripts/_switch_7_to_mx_git2_vps.mjs", js],
      ["/var/www/web-ten-mien/src/templates.js", tpl],
    ];
    let i = 0;
    const next = () => {
      if (i >= ups.length) {
        c.exec("chmod +x /tmp/_run_mx7.sh; ps -eo pid,cmd | awk '/node .*_switch_7_to_mx_git2_vps/ && !/awk/{print $1}' | xargs -r kill; sleep 1; setsid /tmp/_run_mx7.sh </dev/null >/dev/null 2>&1 & echo STARTED; sleep 5; ps -eo pid,cmd | awk '/node .*_switch_7_to_mx_git2_vps/ && !/awk/{print}'; head -20 /tmp/_switch_mx_7.log", (e2, stream) => {
          let o = "";
          stream.on("data", (d) => (o += d.toString()));
          stream.stderr.on("data", (d) => (o += d.toString()));
          stream.on("close", () => {
            console.log(o);
            c.end();
          });
        });
        return;
      }
      const [remote, buf] = ups[i++];
      const ws = sftp.createWriteStream(remote);
      ws.on("close", next);
      ws.end(buf);
    };
    next();
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
