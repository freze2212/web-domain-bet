import { Client } from "ssh2";

const py = `
from pathlib import Path
import json
p = Path("/var/www/web-ten-mien/data/cf_zones_cache.json")
print("exists", p.exists(), "size", p.stat().st_size if p.exists() else 0)
if p.exists():
    arr = json.loads(p.read_text(encoding="utf-8"))
    print("total", len(arr))
    hits = [z for z in arr if "tong88" in str(z.get("name","")).lower()]
    print("tong88 hits", hits[:5], "count", len(hits))
    admin = [z for z in arr if z.get("accountId")=="ddead9accc534c1eb074d2a46fffe748" or "admin@itkjc" in str(z.get("accountName","")).lower()]
    freze = [z for z in arr if z.get("accountId")=="456da4d89821d871fac09c0e5651338a"]
    print("admin_count", len(admin), "freze_count", len(freze))
    # sample account names
    names=set()
    for z in arr:
        names.add((z.get("accountId") or "")[:8] + "|" + str(z.get("accountName") or "")[:40])
    print("accounts", sorted(names)[:10])
`;

const c = new Client();
c.on("ready", () => {
  c.sftp((err, sftp) => {
    const ws = sftp.createWriteStream("/tmp/_chk_cache.py");
    ws.on("close", () => {
      c.exec("python3 /tmp/_chk_cache.py; rm -f /tmp/_chk_cache.py", (e2, st) => {
        let o = "";
        st.on("data", (d) => (o += d));
        st.stderr.on("data", (d) => (o += d));
        st.on("close", () => {
          console.log(o);
          c.end();
        });
      });
    });
    ws.end(Buffer.from(py, "utf8"));
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
