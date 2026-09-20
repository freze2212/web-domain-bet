import { Client } from "ssh2";

function ssh(cmd) {
  return new Promise((resolve, reject) => {
    const c = new Client();
    c.on("ready", () => {
      c.exec(cmd, (e, s) => {
        if (e) return reject(e);
        let o = "";
        s.on("data", (d) => (o += d.toString()));
        s.stderr.on("data", (d) => (o += d.toString()));
        s.on("close", (code) => {
          c.end();
          resolve({ code, o });
        });
      });
    });
    c.on("error", reject);
    c.connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
  });
}

const kill = await ssh(`ps -eo pid,cmd | awk '/node .*_switch_7_to_mx_git2_vps\\.mjs/ && !/awk/ {print $1}' | xargs -r kill; echo killed; sleep 1; ps -eo pid,cmd | awk '/node .*_switch_7_to_mx_git2_vps\\.mjs/ && !/awk/ {print}' || echo none`);
console.log(kill.o);

const start = await ssh(`cd /var/www/web-ten-mien && set -a && . ./.env && set +a && export TZ=Asia/Ho_Chi_Minh && : > /tmp/_switch_mx_7.log && : > /tmp/_switch_mx_7.out && rm -f /tmp/_switch_mx_7.json && nohup stdbuf -oL -eL node scripts/_switch_7_to_mx_git2_vps.mjs >> /tmp/_switch_mx_7.out 2>&1 & echo PID:$! && sleep 8 && ps -eo pid,cmd | awk '/node .*_switch_7_to_mx_git2_vps\\.mjs/ && !/awk/ {print}' && echo --- && head -35 /tmp/_switch_mx_7.log`);
console.log(start.o);
