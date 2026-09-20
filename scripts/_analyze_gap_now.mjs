import { Client } from "ssh2";

const cmd = `
export TZ=Asia/Ho_Chi_Minh
date
echo '=== pm2 ==='
pm2 jlist | python3 -c "
import sys,json,time
d=json.load(sys.stdin); now=time.time()*1000
for p in d:
  if 'session_sexy' in p['name']:
    e=p['pm2_env']; print(p['name'], e.get('status'), 'up_s', int((now-e.get('pm_uptime',now))/1000), 'rst', e.get('restart_time'))
"
echo
python3 - <<'PY'
from pathlib import Path
import json, urllib.request, re
from datetime import datetime

NEED = [1789299653767, 1789299695816, 1789299735574, 1789299820289, 1789299942881]

def read(name):
    return Path(f'/root/.pm2/logs/{name}-out.log').read_text(errors='replace').splitlines()

def around(lines, needles, pad=2):
    out=[]
    for i,l in enumerate(lines):
        if any(n in l for n in needles):
            out.append((i,l))
    return out

print('==== KEY EVENTS NS1+NS2 since 18:34 ====')
for name,label in [('session-sexy-1','NS1'),('session-sexy-2','NS2')]:
    lines=read(name)
    print('---', label, '---')
    for l in lines:
        if any(k in l for k in [
            '[HALL FORWARD]','[HALL MISS]','Ở sảnh','Khởi động lại',
            'ĐĂNG NHẬP','VÀO SẢNH','VÀO MENU','LOGIN_FORM','skip enter','AUTO ENTER',
            'WATCHDOG','Sending session'
        ]):
            if '2026-08' in l or '2026-09-12' in l: continue
            print(l[-200:])
    print()

print('==== TARGET ROUNDS FROM API ====')
for t in ['C01','C03','C05']:
    try:
        d=json.loads(urllib.request.urlopen(f'http://127.0.0.1:3201/predict/get-table-by-name?tableName={t}', timeout=8).read())
        x=d.get('table') or d
        rounds=x.get('totalRound') or []
        print(t, 'status', x.get('statusGame'), 'n', len(rounds), 'last', (rounds[-1] if rounds else None))
        for r in rounds:
            st=r.get('stampTime') or r.get('id')
            if st in NEED or str(st) in map(str, NEED):
                print('  HIT', t, r)
        # also print last 8
        print('  last8:')
        for r in rounds[-8:]:
            print('   ', r.get('stampTime'), r.get('id'), 'pred', r.get('roadRandom'), 'res', r.get('roadFormat'), r.get('road'))
    except Exception as e:
        print(t,'ERR',e)

print()
print('==== syncNewRounds roadRandom ====')
p=Path('/var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/utilities/helperGameSexy.js')
text=p.read_text(errors='replace')
# print function snippet
idx=text.find('async function syncNewRounds')
print(text[idx:idx+1800])
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
