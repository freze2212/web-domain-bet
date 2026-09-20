import { Client } from "ssh2";

const localPy = "c:/FREZE-PRJ/web-tên-miền/scripts/_patch_detach.py";
const c = new Client();
c.on("ready", () => {
  c.sftp((err, sftp) => {
    if (err) throw err;
    sftp.fastPut(localPy, "/tmp/patch_detach.py", (e) => {
      if (e) throw e;
      c.exec("python3 /tmp/patch_detach.py", (e2, s) => {
        let o = "";
        s.on("data", (d) => (o += d.toString()));
        s.stderr.on("data", (d) => (o += d.toString()));
        s.on("close", () => {
          console.log(o || "(empty)");
          c.end();
        });
      });
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
