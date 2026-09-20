import { Client } from "ssh2";

const py = `
from pathlib import Path
import re
roots = [Path("/var/www/web-ten-mien"), Path("/root"), Path("/tmp")]
seen = set()
for root in roots:
    if not root.exists():
        continue
    for p in root.rglob("*"):
        try:
            if not p.is_file() or p.stat().st_size > 2_000_000:
                continue
            name = p.name.lower()
            if not any(x in name for x in [".env", "bak", "backup", "cloudflare", "token"]):
                continue
            text = p.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        for m in re.findall(r"cfut_[A-Za-z0-9]+", text):
            if m in seen:
                continue
            seen.add(m)
            print(str(p), m[:12] + "..." + m[-6:], "len", len(m))
print("TOTAL_UNIQUE", len(seen))
# show pm2 env if any
try:
    import subprocess
    out = subprocess.check_output("pm2 env 12", shell=True, text=True, stderr=subprocess.DEVNULL)
    for m in re.findall(r"cfut_[A-Za-z0-9]+", out):
        print("PM2", m[:12] + "..." + m[-6:])
except Exception as e:
    print("PM2_SKIP", e)
`;

const c = new Client();
c.on("ready", () => {
  c.sftp((err, sftp) => {
    if (err) throw err;
    const ws = sftp.createWriteStream("/tmp/_find_cfut.py");
    ws.on("close", () => {
      c.exec("python3 /tmp/_find_cfut.py; rm -f /tmp/_find_cfut.py", (e2, st) => {
        let o = "";
        st.on("data", (d) => (o += d));
        st.stderr.on("data", (d) => (o += d));
        st.on("close", () => {
          console.log(o.trim());
          c.end();
        });
      });
    });
    ws.end(Buffer.from(py, "utf8"));
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
