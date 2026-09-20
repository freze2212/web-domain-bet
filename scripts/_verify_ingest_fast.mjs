import { Client } from "ssh2";

const cmd = `
export TZ=Asia/Ho_Chi_Minh
echo 'wait 80s...'
sleep 80
date
python3 - <<'PY'
from pathlib import Path
import json, urllib.request

def chunk(name):
    ls=Path(f'/root/.pm2/logs/{name}-out.log').read_text(errors='replace').splitlines()
    idx=0
    for i,l in enumerate(ls):
        if 'poll sảnh mỗi 1s' in l or 'lobby — poll API mỗi' in l:
            idx=i
    return ls[idx:]

for name,label in [('session-sexy-1','NS1'),('session-sexy-2','NS2')]:
    c=chunk(name)
    fw=sum(1 for l in c if '[HALL FORWARD]' in l)
    sk=sum(1 for l in c if '[HALL SKIP]' in l)
    sl=sum(1 for l in c if 'INGEST SLOW' in l or 'timeout of 15000' in l)
    fail=sum(1 for l in c if 'POLL FAIL' in l or 'POLL DEAD' in l)
    print(label, 'fw', fw, 'skip', sk, 'slow/to', sl, 'pollFail', fail)
    for l in c[-12:]:
        print(' ', l[-170:])
    print()

d=json.loads(urllib.request.urlopen('http://127.0.0.1:3201/predict/get-table-by-name?tableName=C06', timeout=6).read())
x=d.get('table') or d
print('C06', x.get('statusGame'))
for r in (x.get('totalRound') or [])[-5:]:
    print(' ', r.get('id'), r.get('stampTime'), 'pred', r.get('roadRandom'), 'res', r.get('roadFormat'))
print('--- err tail ---')
for name in ('session-sexy-1','session-sexy-2'):
    p=Path(f'/root/.pm2/logs/{name}-error.log')
    print(name, [l[-120:] for l in p.read_text(errors='replace').splitlines()[-4:] if '2026-09-13 19:' in l or 'timeout' in l or 'HALL' in l])
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
