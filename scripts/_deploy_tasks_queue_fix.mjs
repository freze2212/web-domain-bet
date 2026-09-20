import { Client } from "ssh2";
import fs from "fs";

const ups = [
  ["c:/FREZE-PRJ/web-tên-miền/src/task-queue.js", "/var/www/web-ten-mien/src/task-queue.js"],
  ["c:/FREZE-PRJ/web-tên-miền/src/history.js", "/var/www/web-ten-mien/src/history.js"],
  ["c:/FREZE-PRJ/web-tên-miền/src/server.js", "/var/www/web-ten-mien/src/server.js"],
  ["c:/FREZE-PRJ/web-tên-miền/public/app.js", "/var/www/web-ten-mien/public/app.js"],
  ["c:/FREZE-PRJ/web-tên-miền/public/index.html", "/var/www/web-ten-mien/public/index.html"],
];

const c = new Client();
c.on("ready", () => {
  c.sftp((err, sftp) => {
    if (err) throw err;
    let i = 0;
    const next = () => {
      if (i >= ups.length) {
        c.exec(
          `cd /var/www/web-ten-mien && set -a && . ./.env && set +a && node --input-type=module -e "
import { reconcileStaleTasks, listTasks } from './src/task-queue.js';
import { reconcileStaleHistory } from './src/history.js';
console.log('stale_tasks', reconcileStaleTasks());
console.log('stale_hist', reconcileStaleHistory());
const t=listTasks({limit:20});
console.log('running', t.filter(x=>x.status==='RUNNING'||x.status==='PENDING').map(x=>x.domain+':'+x.status));
" && pm2 restart web-tenmienbet --update-env && sleep 2 && pm2 describe web-tenmienbet | grep -E 'status|uptime' | head -4`,
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
      const [local, remote] = ups[i++];
      const ws = sftp.createWriteStream(remote);
      ws.on("close", () => {
        console.log("up", remote);
        next();
      });
      ws.end(fs.readFileSync(local));
    };
    next();
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
