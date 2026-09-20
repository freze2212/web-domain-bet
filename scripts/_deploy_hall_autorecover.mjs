import { Client } from "ssh2";
import fs from "fs";

const localPatch = "c:/FREZE-PRJ/web-tên-miền/scripts/_patch_hall_autorecover_remote.js";
const remotePatch = "/tmp/_patch_hall_autorecover_remote.js";

const c = new Client();
c.on("ready", () => {
  c.sftp((err, sftp) => {
    if (err) throw err;
    const data = fs.readFileSync(localPatch);
    const ws = sftp.createWriteStream(remotePatch);
    ws.on("close", () => {
      console.log("UPLOADED", remotePatch);
      c.exec(
        `node ${remotePatch} && pm2 restart session_sexy_2 --update-env && sleep 8 && pm2 show session_sexy_2 | grep -iE 'status|uptime|restart|created' && echo '---LOG---' && tail -n 30 /root/.pm2/logs/session-sexy-2-out.log`,
        { pty: true },
        (e, s) => {
          let o = "";
          s.on("data", (d) => (o += d.toString()));
          s.stderr.on("data", (d) => (o += d.toString()));
          s.on("close", (code) => {
            console.log(o || "(empty)");
            c.end();
            process.exit(code || 0);
          });
        }
      );
    });
    ws.on("error", (e) => {
      console.error(e);
      process.exit(1);
    });
    ws.end(data);
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
