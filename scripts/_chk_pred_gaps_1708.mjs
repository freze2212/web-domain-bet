import { Client } from "ssh2";

const cmd = `
export TZ=Asia/Ho_Chi_Minh
date
echo '=== session around 17:05-17:14 ==='
grep -E '17:0[5-9]|17:1[0-4]|HALL FORWARD|HALL POLL|KEEPALIVE|resetMain|WATCHDOG|Auto Logout|lobby-only' /root/.pm2/logs/session-sexy-2-out.log | tail -90
echo
echo '=== C03 last rounds ==='
curl -sS -m 6 'http://127.0.0.1:3201/predict/get-table-by-name?tableName=C03' > /tmp/c03.json
python3 - <<'PY'
import json
from datetime import datetime, timezone, timedelta
vn=timezone(timedelta(hours=7))
d=json.load(open('/tmp/c03.json',encoding='utf-8'))
x=d.get('table') or d.get('data') or d
rounds=x.get('totalRound') or []
print('status', x.get('statusGame'), 'n', len(rounds))
print('table keys', list(x.keys())[:25])
for r in rounds[-10:]:
  if not isinstance(r, dict):
    print(r); continue
  ts=r.get('stampTime')
  t=datetime.fromtimestamp(ts/1000, vn).strftime('%H:%M:%S') if ts else '-'
  keep={k:r.get(k) for k in r if any(s in k.lower() for s in ('id','stamp','win','pred','ai','result','player','banker','side','guess','bet','score'))}
  print(t, keep)
print('ai0 sample', str(x.get('ai0'))[:200] if x.get('ai0') is not None else None)
PY
echo
echo '=== predict schema / history API ==='
grep -n "predictResult\\|get-table-by-name\\|history\\|ai0\\|prediction" /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/server.js | head -50
echo
echo '=== enqueueHallUpdate / filterData ==='
grep -n "function enqueueHallUpdate\\|function filterData\\|predict" /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/server.js | head -30
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
