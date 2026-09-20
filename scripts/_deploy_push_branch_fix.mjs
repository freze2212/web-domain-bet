import { Client } from "ssh2";
import fs from "fs";
const local = fs.readFileSync("c:/FREZE-PRJ/web-tên-miền/src/templates.js");
const c = new Client();
c.on("ready", () => {
  c.sftp((err, sftp) => {
    const ws = sftp.createWriteStream("/var/www/web-ten-mien/src/templates.js");
    ws.on("close", () => {
      const cmd = [
        "pm2 restart web-tenmienbet --update-env",
        "sleep 2",
        "grep -n 'Detect nhánh remote\\|HEAD:' /var/www/web-ten-mien/src/templates.js | head -8",
        `python3 - <<'PY'
import urllib.request, json
ua={'User-Agent':'Mozilla/5.0'}
for d in ['gg883.win','quocte.bio']:
  req=urllib.request.Request('https://%s/domains.json'%d, headers=ua)
  with urllib.request.urlopen(req, timeout=20) as r:
    j=json.loads(r.read().decode())
  e=j.get(d) or j.get('www.'+d) or {}
  print(d, e.get('main_url'))
PY`,
      ].join("\n");
      c.exec(cmd, (e, s) => {
        let o = "";
        s.on("data", (d) => (o += d.toString()));
        s.stderr.on("data", (d) => (o += d.toString()));
        s.on("close", () => {
          console.log(o);
          c.end();
        });
      });
    });
    ws.end(local);
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
