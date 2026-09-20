import { Client } from "ssh2";

const cmd = `
export TZ=Asia/Ho_Chi_Minh
date
echo '=== pm2 ==='
pm2 jlist | python3 -c "
import sys,json,time
d=json.load(sys.stdin); now=time.time()*1000
for p in d:
  if p['name'] in ('session_sexy_1','session_sexy_2','server_sexy'):
    e=p['pm2_env']
    print(p['name'], e.get('status'), 'up_s', int((now-e.get('pm_uptime',now))/1000), 'rst', e.get('restart_time'))
"
echo
python3 - <<'PY'
from pathlib import Path
import json, urllib.request, re

def lines(name):
    return Path(f'/root/.pm2/logs/{name}-out.log').read_text(errors='replace').splitlines()

def since_boot(name):
    ls=lines(name)
    idx=0
    for i,l in enumerate(ls):
        if 'poll sảnh mỗi 2s' in l or 'lobby — poll' in l or '[ACCOUNT] index=' in l:
            idx=i
    return ls[idx:]

for name,label in [('session-sexy-1','NS1'),('session-sexy-2','NS2')]:
    c=since_boot(name)
    fw=[l for l in c if '[HALL FORWARD]' in l]
    fail=[l for l in c if 'POLL FAIL' in l or 'POLL DEAD' in l or 'HALL POLL]' in l]
    miss=[l for l in c if '[HALL MISS]' in l]
    err=[l for l in c if 'Error' in l or 'THẤT BẠI' in l or 'LOGIN' in l]
    print('====', label, 'boot_lines', len(c), '====')
    print('forward', len(fw), 'poll_msg', len(fail), 'miss70', len(miss))
    print('-- last 20 --')
    for l in c[-20:]:
        print(l[-190:])
    print('-- last fw --')
    for l in fw[-6:]:
        print(l[-190:])
    print()

print('==== ERR LOGS ====')
for name in ('session-sexy-1','session-sexy-2','server-sexy'):
    p=Path(f'/root/.pm2/logs/{name}-error.log')
    if not p.exists():
        continue
    ls=p.read_text(errors='replace').splitlines()[-12:]
    print('---', name, '---')
    for l in ls:
        if l.strip(): print(l[-200:])

print('==== C06 last 6 ====')
d=json.loads(urllib.request.urlopen('http://127.0.0.1:3201/predict/get-table-by-name?tableName=C06', timeout=6).read())
x=d.get('table') or d
print('status', x.get('statusGame'))
for r in (x.get('totalRound') or [])[-6:]:
    print(r.get('id'), r.get('stampTime'), 'pred', r.get('roadRandom'), 'res', r.get('roadFormat'))
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
