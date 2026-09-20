/**
 * Deploy hub wiring fixes to VPS + sync CF tokens (Admin All-accounts).
 */
import { Client } from "ssh2";
import fs from "fs";
import path from "path";

const root = "c:/FREZE-PRJ/web-tên-miền";
const files = ["src/templates.js", "src/cloudflare.js"];

for (const line of fs.readFileSync(path.join(root, ".env"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const i = t.indexOf("=");
  process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const adminTok = process.env.CLOUDFLARE_ADMIN_API_TOKEN;
if (!adminTok) throw new Error("missing CLOUDFLARE_ADMIN_API_TOKEN");

const patchPy = `from pathlib import Path
import base64
tok = base64.b64decode("${Buffer.from(adminTok, "utf8").toString("base64")}").decode()
p = Path("/var/www/web-ten-mien/.env")
lines = p.read_text(encoding="utf-8", errors="ignore").splitlines()
out = []
sp = sa = False
for line in lines:
    if line.startswith("CLOUDFLARE_API_TOKEN="):
        out.append("CLOUDFLARE_API_TOKEN=" + tok)
        sp = True
    elif line.startswith("CLOUDFLARE_ADMIN_API_TOKEN="):
        out.append("CLOUDFLARE_ADMIN_API_TOKEN=" + tok)
        sa = True
    else:
        out.append(line)
if not sp:
    out.append("CLOUDFLARE_API_TOKEN=" + tok)
if not sa:
    out.append("CLOUDFLARE_ADMIN_API_TOKEN=" + tok)
p.write_text("\\n".join(out) + "\\n", encoding="utf-8")
print("env ok", sp, sa)
`;

const c = new Client();
function put(sftp, localOrBuf, remote) {
  return new Promise((resolve, reject) => {
    const ws = sftp.createWriteStream(remote);
    ws.on("close", resolve);
    ws.on("error", reject);
    ws.end(typeof localOrBuf === "string" ? fs.readFileSync(localOrBuf) : localOrBuf);
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
      await put(sftp, path.join(root, rel), `/var/www/web-ten-mien/${rel}`);
      console.log("OK", rel);
    }
    await put(sftp, Buffer.from(patchPy, "utf8"), "/tmp/_patch_cf_env.py");
    console.log("OK /tmp/_patch_cf_env.py");

    const r1 = await exec("python3 /tmp/_patch_cf_env.py && rm -f /tmp/_patch_cf_env.py");
    console.log(r1.o.trim(), "exit", r1.code);
    const r2 = await exec("pm2 restart web-tenmienbet --update-env");
    console.log(r2.o.trim().slice(0, 800), "exit", r2.code);
    const r3 = await exec(
      "grep -nE 'git2|pagesAccountId|lp-1a-xx88' /var/www/web-ten-mien/src/templates.js | head -35"
    );
    console.log(r3.o.trim());
    c.end();
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
