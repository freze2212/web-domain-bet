/** Push restored Freze + Admin tokens to VPS .env (from local .env). */
import { Client } from "ssh2";
import fs from "fs";

for (const line of fs.readFileSync(".env", "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const i = t.indexOf("=");
  process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const FREZE = process.env.CLOUDFLARE_API_TOKEN;
const ADMIN = process.env.CLOUDFLARE_ADMIN_API_TOKEN;
if (!FREZE || !ADMIN) throw new Error("missing tokens in local .env");
if (FREZE === ADMIN) throw new Error("Freze and Admin must differ");

const py = `
from pathlib import Path
import base64
freze = base64.b64decode("${Buffer.from(FREZE, "utf8").toString("base64")}").decode()
admin = base64.b64decode("${Buffer.from(ADMIN, "utf8").toString("base64")}").decode()
p = Path("/var/www/web-ten-mien/.env")
lines = p.read_text(encoding="utf-8", errors="ignore").splitlines()
out = []
sp = sa = False
for line in lines:
    if line.startswith("CLOUDFLARE_API_TOKEN="):
        out.append("CLOUDFLARE_API_TOKEN=" + freze)
        sp = True
    elif line.startswith("CLOUDFLARE_ADMIN_API_TOKEN="):
        out.append("CLOUDFLARE_ADMIN_API_TOKEN=" + admin)
        sa = True
    else:
        out.append(line)
if not sp:
    out.append("CLOUDFLARE_API_TOKEN=" + freze)
if not sa:
    out.append("CLOUDFLARE_ADMIN_API_TOKEN=" + admin)
p.write_text("\\n".join(out) + "\\n", encoding="utf-8")
print("updated", "freze", freze[:10]+"..."+freze[-6:], "admin", admin[:10]+"..."+admin[-6:], "same", freze==admin)
`;

const c = new Client();
c.on("ready", () => {
  c.sftp((err, sftp) => {
    if (err) throw err;
    const ws = sftp.createWriteStream("/tmp/_restore_cf_tok.py");
    ws.on("close", () => {
      c.exec(
        "python3 /tmp/_restore_cf_tok.py && rm -f /tmp/_restore_cf_tok.py && pm2 restart web-tenmienbet --update-env",
        (e2, st) => {
          let o = "";
          st.on("data", (d) => (o += d));
          st.stderr.on("data", (d) => (o += d));
          st.on("close", (code) => {
            console.log(o.trim().slice(0, 1500));
            console.log("exit", code);
            c.end();
          });
        }
      );
    });
    ws.end(Buffer.from(py, "utf8"));
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
