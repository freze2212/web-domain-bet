import { Client } from "ssh2";
import fs from "fs";

const local = "c:/FREZE-PRJ/web-tên-miền/scripts/_switch_7_to_mx_git2_vps.mjs";
const remote = "/var/www/web-ten-mien/scripts/_switch_7_to_mx_git2_vps.mjs";
const content = fs.readFileSync(local);

const c = new Client();
c.on("ready", () => {
  c.sftp((err, sftp) => {
    if (err) throw err;
    // ensure dir
    sftp.mkdir("/var/www/web-ten-mien/scripts", () => {
      const ws = sftp.createWriteStream(remote);
      ws.on("close", () => {
        console.log("uploaded");
        const start = `
pkill -f '_switch_7_to_mx_git2_vps' 2>/dev/null || true
sleep 1
cd /var/www/web-ten-mien
set -a; . ./.env; set +a
export TZ=Asia/Ho_Chi_Minh
rm -f /tmp/_switch_mx_7.log /tmp/_switch_mx_7.out /tmp/_switch_mx_7.json
nohup node -u scripts/_switch_7_to_mx_git2_vps.mjs > /tmp/_switch_mx_7.out 2>&1 &
echo STARTED:$!
sleep 3
wc -l /tmp/_switch_mx_7.log /tmp/_switch_mx_7.out
head -30 /tmp/_switch_mx_7.log
head -30 /tmp/_switch_mx_7.out
`;
        c.exec(start, (e2, stream) => {
          let o = "";
          stream.on("data", (d) => (o += d.toString()));
          stream.stderr.on("data", (d) => (o += d.toString()));
          stream.on("close", () => {
            console.log(o);
            c.end();
          });
        });
      });
      ws.on("error", (e) => console.error("ws", e));
      ws.end(content);
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
