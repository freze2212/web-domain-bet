import { Client } from "ssh2";

const cmd = `
curl -sS --max-time 25 'https://lp-xoamaan-6c-llwin.pages.dev/api/data' -o /tmp/xoama_api.json
python3 - <<'PY'
import json
j=json.load(open('/tmp/xoama_api.json',encoding='utf-8'))
db=j.get('db') or j
cfg=(db.get('config') or {})
print('keys', list(j)[:10] if isinstance(j,dict) else type(j))
print('domainConfigs=', json.dumps(cfg.get('domainConfigs'), ensure_ascii=False, indent=2))
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
