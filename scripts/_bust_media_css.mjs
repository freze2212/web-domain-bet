import { Client } from "ssh2";
const cmd = `python3 - <<'PY'
from pathlib import Path
p=Path('/var/www/media-vault/public/index.html')
t=p.read_text()
t2=t.replace('href="style.css"','href="style.css?v=20260911-thumb-sm"',1)
p.write_text(t2)
print('ok', 'style.css?v=' in t2)
PY`;
const c = new Client();
c.on("ready", () => {
  c.exec(cmd, (e, s) => {
    let o = "";
    s.on("data", (d) => (o += d));
    s.on("close", () => {
      console.log(o);
      c.end();
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
