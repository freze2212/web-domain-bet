import { Client } from "ssh2";
import fs from "fs";

const cmd = `
set -a; . /var/www/web-ten-mien/.env; set +a
for name in FREZE ADMIN; do
  if [ "$name" = FREZE ]; then T="$CLOUDFLARE_API_TOKEN"; else T="$CLOUDFLARE_ADMIN_API_TOKEN"; fi
  echo "== $name =="
  curl -sS "https://api.cloudflare.com/client/v4/zones?name=gg88mt.com" -H "Authorization: Bearer $T" | python3 -c 'import sys,json;j=json.load(sys.stdin);z=(j.get("result") or [None])[0]; print("ok",j.get("success"), z and {"id":z["id"],"status":z["status"],"ns":z.get("name_servers"),"account":(z.get("account") or {}).get("name")} or "NO_ZONE", j.get("errors"))'
done
echo '=== age of stuck task ==='
python3 - <<'PY'
from datetime import datetime, timezone
start=datetime.fromisoformat('2026-09-13T13:19:14.630Z'.replace('Z','+00:00'))
now=datetime.now(timezone.utc)
print('stuck_minutes', round((now-start).total_seconds()/60,1))
PY
`;

const c = new Client();
c.on("ready", () => {
  c.exec(cmd, (e, s) => {
    let o = "";
    s.on("data", (d) => (o += d.toString()));
    s.stderr.on("data", (d) => (o += d.toString()));
    s.on("close", () => {
      console.log(o || "(empty)");
      c.end();
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
