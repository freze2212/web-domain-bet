import { Client } from "ssh2";
import fs from "fs";
import path from "path";

const root = "c:/FREZE-PRJ/web-tên-miền";
const script = fs.readFileSync(path.join(root, "scripts/_qa_vps_runner_p1.mjs"), "utf8");
const OUT = path.join(root, "data", "_QA_DEEP_VPS_P1.json");

const c = new Client();
c.on("ready", () => {
  c.sftp((err, sftp) => {
    const ws = sftp.createWriteStream("/tmp/_qa_p1.mjs");
    ws.on("close", () => {
      c.exec("node /tmp/_qa_p1.mjs", { maxBuffer: 6 * 1024 * 1024 }, (e, s) => {
        let o = "";
        s.on("data", (d) => (o += d));
        s.stderr.on("data", (d) => (o += d));
        s.on("close", () => {
          const i = o.indexOf('{"at"');
          if (i < 0) {
            console.error(o.slice(-4000));
            process.exit(1);
          }
          const r = JSON.parse(o.slice(i));
          fs.writeFileSync(OUT, JSON.stringify(r, null, 2));
          console.log(JSON.stringify(r.summary));
          console.log("live", r.liveSample);
          c.end();
        });
      });
    });
    ws.end(script);
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
