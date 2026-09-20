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
      console.log("uploaded ok");
      const cmd = `
cd /var/www/web-ten-mien
set -a; . ./.env; set +a
export TZ=Asia/Ho_Chi_Minh
: > /tmp/_switch_mx_7.log
: > /tmp/_switch_mx_7.out
rm -f /tmp/_switch_mx_7.json
setsid bash -c 'cd /var/www/web-ten-mien; set -a; . ./.env; set +a; export TZ=Asia/Ho_Chi_Minh; stdbuf -oL -eL node scripts/_switch_7_to_mx_git2_vps.mjs >> /tmp/_switch_mx_7.out 2>&1' </dev/null >/dev/null 2>&1 &
echo LAUNCHED:$!
sleep 8
ps aux | grep '_switch_7_to_mx_git2_vps' | grep -v grep || echo NOT_RUNNING
echo '---LOG---'
cat /tmp/_switch_mx_7.log
echo '---OUT---'
head -40 /tmp/_switch_mx_7.out
`;
      c.exec(cmd, (e2, stream) => {
        let o = "";
        stream.on("data", (d) => (o += d.toString()));
        stream.stderr.on("data", (d) => (o += d.toString()));
        stream.on("close", () => {
          console.log(o);
          c.end();
        });
      });
    });
    ws.end(content);
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
