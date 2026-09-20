import { Client } from "ssh2";

const cmd = `
export TZ=Asia/Ho_Chi_Minh
sleep 55
date
python3 - <<'PY'
from pathlib import Path
import json, urllib.request

def after(name, needle):
    ls=Path(f'/root/.pm2/logs/{name}-out.log').read_text(errors='replace').splitlines()
    idx=0
    for i,l in enumerate(ls):
        if needle in l:
            idx=i
    return ls[idx:]

for name,label in [('session-sexy-1','NS1'),('session-sexy-2','NS2')]:
    c=after(name, 'Ở sảnh — poll hall API')
    fw=[l for l in c if '[HALL FORWARD]' in l]
    sk=[l for l in c if '[HALL SKIP]' in l]
    sl=[l for l in c if 'INGEST SLOW' in l]
    fail=[l for l in c if 'POLL FAIL' in l or 'POLL DEAD' in l]
    print(label, 'fw', len(fw), 'skip', len(sk), 'slow', len(sl), 'fail', len(fail), 'lines', len(c))
    for l in c[-10:]:
        print(' ', l[-170:])
    print()

d=json.loads(urllib.request.urlopen('http://127.0.0.1:3201/predict/get-table-by-name?tableName=C06', timeout=6).read())
x=d.get('table') or d
print('C06', x.get('statusGame'))
for r in (x.get('totalRound') or [])[-6:]:
    print(' ', r.get('id'), r.get('stampTime'), 'pred', r.get('roadRandom'), 'res', r.get('roadFormat'))
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
