import { Client } from "ssh2";

const cmd = `
sed -i 's/HALL_STALE_MS=150000/HALL_STALE_MS=240000/' /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/run-hall-supervisor.sh
cat /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/run-hall-supervisor.sh
pm2 restart hall_supervisor --update-env
sleep 2
tail -n 8 /root/.pm2/logs/hall-supervisor-out.log
export TZ=Asia/Ho_Chi_Minh
date
python3 - <<'PY'
import json, urllib.request
from datetime import datetime, timezone, timedelta
vn=timezone(timedelta(hours=7))
now=datetime.now(vn)
for t in ['C01','C03','C05']:
  d=json.loads(urllib.request.urlopen('http://127.0.0.1:3201/predict/get-table-by-name?tableName='+t, timeout=5).read())
  x=d.get('table') or d
  r=(x.get('totalRound') or [{}])[-1]
  ts=r.get('stampTime')
  tm=datetime.fromtimestamp(ts/1000, vn).strftime('%H:%M:%S') if ts else '-'
  age=(now.timestamp()*1000 - ts)/1000 if ts else None
  print(t, x.get('statusGame'), r.get('id'), tm, 'age', round(age) if age is not None else None)
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
