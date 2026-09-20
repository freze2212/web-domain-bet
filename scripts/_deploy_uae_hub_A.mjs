import { Client } from "ssh2";
import fs from "fs";
import path from "path";

const root = "c:/FREZE-PRJ/web-tên-miền";
const files = [
  "src/templates.js",
  "src/cloudflare.js",
  "src/repo-scanner.js",
  "src/server.js",
  "src/verifier.js",
  "src/app.js",
];

// patch VPS .env admin token
const newTok = "cfut_LilEayRZX9hV25QCUedDj73ZFwa6HHzlba5OotzFaf262ef3";

const c = new Client();
function put(sftp, local, remote) {
  return new Promise((resolve, reject) => {
    const ws = sftp.createWriteStream(remote);
    ws.on("close", resolve);
    ws.on("error", reject);
    ws.end(fs.readFileSync(local));
  });
}

c.on("ready", () => {
  c.sftp(async (err, sftp) => {
    if (err) throw err;
    for (const rel of files) {
      await put(sftp, path.join(root, rel), `/var/www/web-ten-mien/${rel}`);
      console.log("OK", rel);
    }
    const cmd = [
      "mkdir -p /var/www/Landingpages/GG88",
      "if [ ! -d /var/www/Landingpages/GG88/landing-page-uae/.git ]; then git clone https://github.com/freze2212/landing-page-uae.git /var/www/Landingpages/GG88/landing-page-uae; else cd /var/www/Landingpages/GG88/landing-page-uae && git pull --ff-only; fi",
      `python3 - <<'PY'
from pathlib import Path
p=Path('/var/www/web-ten-mien/.env')
lines=p.read_text(encoding='utf-8',errors='ignore').splitlines()
out=[]
found=False
for line in lines:
  if line.startswith('CLOUDFLARE_ADMIN_API_TOKEN='):
    out.append('CLOUDFLARE_ADMIN_API_TOKEN=${newTok}')
    found=True
  else:
    out.append(line)
if not found:
  out.append('CLOUDFLARE_ADMIN_API_TOKEN=${newTok}')
p.write_text('\\n'.join(out)+'\\n', encoding='utf-8')
print('env admin token updated', found)
PY`.replace("${newTok}", newTok),
      "pm2 restart web-tenmienbet --update-env",
      "test -f /var/www/Landingpages/GG88/landing-page-uae/domains.json && echo CLONE_OK",
      "grep -n landing_page_uae /var/www/web-ten-mien/src/templates.js | head -3",
    ].join(" && ");
    c.exec(cmd, (e2, st) => {
      let o = "";
      st.on("data", (d) => (o += d));
      st.stderr.on("data", (d) => (o += d));
      st.on("close", (code) => {
        console.log(o.slice(0, 2500));
        console.log("exit", code);
        c.end();
      });
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
