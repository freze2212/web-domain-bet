import { Client } from "ssh2";

const remote = `
import fs from "fs";
import path from "path";
const root = "/var/www/web-ten-mien";
function walk(dir, out=[]) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name === ".git") continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.name === "domains.json" && /lp-gg88-vip/i.test(p)) out.push(p);
  }
  return out;
}
for (const p of walk(root)) {
  try {
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    const e = j["tong88vip.com"] || j["www.tong88vip.com"];
    console.log(p, e ? JSON.stringify(e) : "MISSING");
  } catch (err) {
    console.log(p, "ERR", err.message);
  }
}
`;

const c = new Client();
c.on("ready", () => {
  c.sftp((err, sftp) => {
    if (err) throw err;
    const ws = sftp.createWriteStream("/tmp/_chk_tong88_dj.mjs");
    ws.on("close", () => {
      c.exec("node /tmp/_chk_tong88_dj.mjs", (e2, st) => {
        let o = "";
        st.on("data", (d) => (o += d));
        st.stderr.on("data", (d) => (o += d));
        st.on("close", () => {
          console.log(o);
          c.end();
        });
      });
    });
    ws.end(remote);
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
