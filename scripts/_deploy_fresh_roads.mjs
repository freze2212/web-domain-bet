import { Client } from "ssh2";
import { readFileSync } from "fs";

const py = readFileSync("c:/FREZE-PRJ/web-tên-miền/scripts/_patch_fresh_only_roads.py");
const remote = `
set -e
python3 /tmp/_patch_fresh_only_roads.py
node --check /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js
echo SYNTAX_OK
# không restart session — supervisor sẽ kéo nếu stamp đứng >4p
tail -n 5 /root/.pm2/logs/hall-supervisor-out.log
`;

const c = new Client();
c.on("ready", () => {
  c.sftp((err, sftp) => {
    if (err) throw err;
    sftp.writeFile("/tmp/_patch_fresh_only_roads.py", py, (e2) => {
      if (e2) throw e2;
      c.exec(remote, (e3, stream) => {
        let o = "";
        stream.on("data", (d) => (o += d.toString()));
        stream.stderr.on("data", (d) => (o += d.toString()));
        stream.on("close", (code) => {
          console.log(o || "(empty)");
          c.end();
          process.exit(code || 0);
        });
      });
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
