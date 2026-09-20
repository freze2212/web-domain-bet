import { Client } from "ssh2";

const cmd = `
export TZ=Asia/Ho_Chi_Minh
date
echo '=== pm2 ==='
pm2 jlist | python3 -c "
import sys,json,time
d=json.load(sys.stdin); now=time.time()*1000
for p in d:
  if p['name'] in ('session_sexy_1','session_sexy_2','server_sexy','hall_supervisor'):
    e=p['pm2_env']
    print(p['name'], e.get('status'), 'up_s', int((now-e.get('pm_uptime',now))/1000), 'rst', e.get('restart_time'), e.get('pm_exec_path'))
"
echo
python3 - <<'PY'
from pathlib import Path
import json, urllib.request, re, time
from collections import Counter

def boot_lines(name):
    p=Path(f'/root/.pm2/logs/{name}-out.log')
    lines=p.read_text(errors='replace').splitlines()
    idx=0
    for i,l in enumerate(lines):
        if '[ACCOUNT] index=' in l or '[ACCOUNT LOCK]' in l:
            idx=i
    return lines[idx:]

def err_tail(name, n=20):
    p=Path(f'/root/.pm2/logs/{name}-error.log')
    if not p.exists():
        return []
    return p.read_text(errors='replace').splitlines()[-n:]

def analyze(name, label):
    c=boot_lines(name)
    fw=[l for l in c if '[HALL FORWARD]' in l]
    fresh=sum(1 for l in fw if 'fresh=1' in l)
    stale=sum(1 for l in fw if 'fresh=0' in l)
    miss=[l for l in c if '[HALL MISS]' in l]
    wd=[l for l in c if '[WATCHDOG]' in l]
    reset=[l for l in c if 'Khởi động lại' in l or 'resetMain' in l or 'closeHard' in l or 'RECOVER' in l]
    enter=[l for l in c if 'AUTO ENTER' in l or 'ĐÃ VÀO THẲNG' in l or 'skip enter' in l]
    cap=[l for l in c if 'Sending session' in l or 'notify-screenshot' in l or '[SCREENSHOT' in l]
    lobby=[l for l in c if 'Ở sảnh' in l]
    login_fail=[l for l in c if 'LOGIN_FORM' in l or 'Nhập thất bại' in l or 'THẤT BẠI' in l]
    stamps=[]
    for l in fw:
        m=re.search(r'stamp=(\\d+)', l)
        if m: stamps.append(int(m.group(1)))
    print('====', label, '====')
    print('boot_lines', len(c), 'forward', len(fw), 'fresh1', fresh, 'fresh0', stale)
    print('miss', len(miss), 'watchdog', len(wd), 'resetish', len(reset), 'lobby', len(lobby))
    print('enter', len(enter), 'capture', len(cap), 'login_fail', len(login_fail))
    if stamps:
        print('stamp_min', stamps[0], 'stamp_last', stamps[-1], 'unique', len(set(stamps)), 'increased', stamps[-1]>stamps[0])
    print('-- last forward --')
    for l in fw[-6:]:
        print(l[-180:])
    print('-- last miss/reset --')
    for l in [x for x in c if '[HALL MISS]' in x or 'Khởi động lại' in x or 'LOGIN_FORM' in x][-6:]:
        print(l[-180:])
    print('-- last 12 --')
    for l in c[-12:]:
        print(l[-180:])
    print('-- err --')
    for l in err_tail(name, 8):
        if l.strip():
            print(l[-180:])
    print()

analyze('session-sexy-1','NS1')
analyze('session-sexy-2','NS2')

print('==== LIVE TABLES ====')
for t in ['C01','C03','C05','C07','C09']:
    try:
        d=json.loads(urllib.request.urlopen(f'http://127.0.0.1:3201/predict/get-table-by-name?tableName={t}', timeout=5).read())
        x=d.get('table') or d
        rounds=x.get('totalRound') or []
        r=rounds[-1] if rounds else {}
        age=None
        st=r.get('stampTime')
        if st:
            # stamp sometimes ms unix-like 1789... not wall clock; use id/status
            age='stamp='+str(st)
        pred=r.get('roadRandom')
        res=r.get('roadFormat')
        gap = 'GAP' if (pred in (None,'','—','-') or res in (None,'','—','-')) else 'ok'
        print(t, x.get('statusGame'), 'id', r.get('id'), age, 'pred', pred, 'res', res, gap, 'nRound', len(rounds))
    except Exception as e:
        print(t, 'ERR', e)
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
