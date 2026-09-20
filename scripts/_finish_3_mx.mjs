import { Client } from "ssh2";
import fs from "fs";

const js = fs.readFileSync("c:/FREZE-PRJ/web-tên-miền/scripts/_switch_7_to_mx_git2_vps.mjs");
const tpl = fs.readFileSync("c:/FREZE-PRJ/web-tên-miền/src/templates.js");
const sh = `#!/bin/bash
cd /var/www/web-ten-mien || exit 1
set -a; . ./.env; set +a
export TZ=Asia/Ho_Chi_Minh
echo RUNNER_START $(date -Is) > /tmp/_switch_mx_7.log
: > /tmp/_switch_mx_7.out
rm -f /tmp/_switch_mx_7.json
exec stdbuf -oL -eL node scripts/_switch_7_to_mx_git2_vps.mjs >> /tmp/_switch_mx_7.out 2>&1
`;

const c = new Client();
c.on("ready", () => {
  c.sftp((err, sftp) => {
    if (err) throw err;
    const ups = [
      ["/var/www/web-ten-mien/scripts/_switch_7_to_mx_git2_vps.mjs", js],
      ["/var/www/web-ten-mien/src/templates.js", tpl],
      ["/tmp/_run_mx7.sh", Buffer.from(sh)],
    ];
    let i = 0;
    const next = () => {
      if (i >= ups.length) {
        c.exec(
          `chmod +x /tmp/_run_mx7.sh
for p in $(ps -eo pid,cmd | awk '/[n]ode scripts\\/_switch_7_to_mx_git2_vps\\.mjs/{print $1}'); do kill $p; done
sleep 1
setsid /tmp/_run_mx7.sh </dev/null >/dev/null 2>&1 &
echo STARTED:$!
sleep 5
ps -eo pid,cmd | awk '/[n]ode scripts\\/_switch_7_to_mx_git2_vps\\.mjs/{print}'
grep -E 'domains =|gg88t|writeMx|reset --hard' /var/www/web-ten-mien/scripts/_switch_7_to_mx_git2_vps.mjs | head -20
echo '---LOG---'
cat /tmp/_switch_mx_7.log`,
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
