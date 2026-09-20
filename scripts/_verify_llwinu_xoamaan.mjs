import { Client } from "ssh2";

const cmd = `
export TZ=Asia/Ho_Chi_Minh
echo '=== wait pages deploy ~45s ==='
sleep 45
echo '=== live domains.json ==='
curl -sS --max-time 20 'https://lp-xoamaan-6c-llwin.pages.dev/domains.json?v='"$(date +%s)" | python3 -c "import sys,json; j=json.load(sys.stdin); print(json.dumps(j, ensure_ascii=False, indent=2))"
echo
echo '=== live api data domainConfigs ==='
curl -sS --max-time 20 'https://lp-xoamaan-6c-llwin.pages.dev/api/data' | python3 - <<'PY'
import sys,json
j=json.load(sys.stdin)
cfg=(j.get('db') or j).get('config') or {}
print('defaultHouseLink', cfg.get('defaultHouseLink'))
print('domainConfigs', json.dumps(cfg.get('domainConfigs') or {}, ensure_ascii=False, indent=2))
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
