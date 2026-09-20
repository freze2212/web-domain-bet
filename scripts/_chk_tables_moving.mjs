import { Client } from "ssh2";

const cmd = `
python3 - <<'PY'
import urllib.request, json, time
def get(t):
  u=f'https://tool.toolbcr79.com/predict/get-table-by-name?tableName={t}'
  d=json.loads(urllib.request.urlopen(u, timeout=8).read().decode())
  x=d.get('table') or d
  rounds=x.get('totalRound') or []
  last=rounds[-1] if rounds else {}
  return {
    'table': t,
    'status': x.get('statusGame'),
    'iTime': x.get('iTime'),
    'n': len(rounds),
    'lastId': last.get('id'),
    'stamp': last.get('stampTime'),
    'keys': list(last.keys())[:12] if last else [],
    'last': {k:last.get(k) for k in list(last.keys())[:15]} if last else None,
  }
for t in ['C03','C01','C05','C02']:
  try:
    print(get(t))
  except Exception as e:
    print(t, e)
print('--- wait 40s ---')
time.sleep(40)
print('C03 again', get('C03'))
print('C01 again', get('C01'))
PY
# recent forward count in last 60 lines
tail -n 40 /root/.pm2/logs/session-sexy-2-out.log | grep -E 'FORWARD|KEEPALIVE|POLL|Error' || echo '(no key in last 40 — quiet ok if network-driven)'
tail -n 15 /root/.pm2/logs/session-sexy-2-out.log
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
