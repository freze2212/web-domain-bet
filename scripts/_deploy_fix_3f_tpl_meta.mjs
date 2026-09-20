import { Client } from "ssh2";
import fs from "fs";
const buf = fs.readFileSync("c:/FREZE-PRJ/web-tên-miền/src/templates.js");
const c = new Client();
c.on("ready", () => {
  c.sftp((err, sftp) => {
    const ws = sftp.createWriteStream("/var/www/web-ten-mien/src/templates.js");
    ws.on("close", () => {
      c.exec("pm2 restart web-tenmienbet --update-env; sleep 2; grep -A6 'ladpage_3f_nhannhan' /var/www/web-ten-mien/src/templates.js | head -10", (e,s)=>{
        let o=""; s.on("data",d=>o+=d); s.stderr.on("data",d=>o+=d); s.on("close",()=>{console.log(o);c.end();});
      });
    });
    ws.end(buf);
  });
}).connect({host:"103.146.22.218",username:"root",password:"admin123@!"});
