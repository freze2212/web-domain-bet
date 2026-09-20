import { Client } from "ssh2";
import fs from "fs";

const js = fs.readFileSync("c:/FREZE-PRJ/web-tên-miền/scripts/_cleanup_3f_to_5f_vps.mjs");
const sh = `#!/bin/bash
cd /var/www/web-ten-mien || exit 1
set -a; . ./.env; set +a
export TZ=Asia/Ho_Chi_Minh
exec stdbuf -oL -eL node scripts/_cleanup_3f_to_5f_vps.mjs >> /tmp/_cleanup_3f_5f.out 2>&1
`;

const c = new Client();
c.on("ready", () => {
  c.sftp((err, sftp) => {
    if (err) throw err;
    const w1 = sftp.createWriteStream("/var/www/web-ten-mien/scripts/_cleanup_3f_to_5f_vps.mjs");
    w1.on("close", () => {
      const w2 = sftp.createWriteStream("/tmp/_run_cleanup_3f5f.sh");
      w2.on("close", () => {
        c.exec(
          `chmod +x /tmp/_run_cleanup_3f5f.sh
for p in $(ps -eo pid,cmd | awk '/[n]ode scripts\\/_cleanup_3f_to_5f/{print $1}'); do kill $p; done
sleep 1
: > /tmp/_cleanup_3f_5f.log
: > /tmp/_cleanup_3f_5f.out
setsid /tmp/_run_cleanup_3f5f.sh </dev/null >/dev/null 2>&1 &
echo STARTED:$!
sleep 8
ps -eo pid,cmd | awk '/[n]ode scripts\\/_cleanup_3f_to_5f/{print}'
head -40 /tmp/_cleanup_3f_5f.log
head -40 /tmp/_cleanup_3f_5f.out
`,
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
      w2.end(Buffer.from(sh));
    });
    w1.end(js);
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
