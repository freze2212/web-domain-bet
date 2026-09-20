import { Client } from "ssh2";
import fs from "fs";

const files = [
  ["c:/FREZE-PRJ/web-tên-miền/src/templates.js", "/var/www/web-ten-mien/src/templates.js"],
  ["c:/FREZE-PRJ/web-tên-miền/scripts/_switch_7_to_mx_git2_vps.mjs", "/var/www/web-ten-mien/scripts/_switch_7_to_mx_git2_vps.mjs"],
];

const c = new Client();
c.on("ready", () => {
  c.sftp((err, sftp) => {
    if (err) throw err;
    let i = 0;
    const next = () => {
      if (i >= files.length) {
        const cmd = `
pkill -f '_switch_7_to_mx_git2_vps' 2>/dev/null || true
sleep 1
cd /var/www/web-ten-mien
: > /tmp/_switch_mx_7.log
: > /tmp/_switch_mx_7.out
rm -f /tmp/_switch_mx_7.json
setsid bash -c 'cd /var/www/web-ten-mien; set -a; . ./.env; set +a; export TZ=Asia/Ho_Chi_Minh; stdbuf -oL -eL node scripts/_switch_7_to_mx_git2_vps.mjs >> /tmp/_switch_mx_7.out 2>&1' </dev/null >/dev/null 2>&1 &
echo LAUNCHED:$!
sleep 6
ps aux | grep '_switch_7_to_mx_git2_vps.mjs' | grep -v grep || echo NOT_RUNNING
head -25 /tmp/_switch_mx_7.log
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
        return;
      }
      const [local, remote] = files[i++];
      const buf = fs.readFileSync(local);
      const ws = sftp.createWriteStream(remote);
      ws.on("close", () => {
        console.log("up", remote);
        next();
      });
      ws.end(buf);
    };
    next();
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
