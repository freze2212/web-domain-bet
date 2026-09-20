import { Client } from "ssh2";
import fs from "fs";
import path from "path";

const root = "c:/FREZE-PRJ/web-tên-miền";
const files = [
  "src/verifier.js",
  "src/repo-scanner.js",
  "src/task-workers.js",
  "public/app.js",
];

const c = new Client();
function putFile(sftp, local, remotePath) {
  return new Promise((resolve, reject) => {
    const ws = sftp.createWriteStream(remotePath);
    ws.on("close", resolve);
    ws.on("error", reject);
    ws.end(fs.readFileSync(local));
  });
}
function exec(cmd) {
  return new Promise((resolve, reject) => {
    c.exec(cmd, (err, st) => {
      if (err) return reject(err);
      let o = "";
      st.on("data", (d) => (o += d));
      st.stderr.on("data", (d) => (o += d));
      st.on("close", (code) => resolve({ code, o }));
    });
  });
}

c.on("ready", () => {
  c.sftp(async (err, sftp) => {
    if (err) throw err;
    for (const rel of files) {
      await putFile(sftp, path.join(root, rel), `/var/www/web-ten-mien/${rel}`);
      console.log("OK", rel);
    }
    const r = await exec("pm2 restart web-tenmienbet --update-env");
    console.log(r.o.trim().slice(0, 300));
    c.end();
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
