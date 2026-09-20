import { Client } from "ssh2";
const c = new Client();
c.on("ready", () => {
  c.exec(
    `python3 - <<'PY'
import re
p=open('/var/www/web-ten-mien/.env','r',encoding='utf-8',errors='ignore').read().splitlines()
for line in p:
    t=line.strip()
    if not t or t.startswith('#'): continue
    if any(k in t.upper() for k in ['CLOUDFLARE','CF_','ACCOUNT']):
        if '=' in t:
            k,v=t.split('=',1)
            v=v.strip().strip('"').strip("'")
            if any(x in k.upper() for x in ['TOKEN','SECRET','KEY','PASSWORD']):
                print(f"{k}=***len{len(v)}")
            else:
                print(f"{k}={v}")
PY`,
    (e, s) => {
      let o = "", err = "";
      s.on("data", (d) => (o += d));
      s.stderr.on("data", (d) => (err += d));
      s.on("close", () => {
        console.log(o || err);
        c.end();
      });
    }
  );
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
