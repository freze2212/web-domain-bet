import { Client } from "ssh2";

const cmd = `
export TZ=Asia/Ho_Chi_Minh
echo "wait 90s for dual login..."
sleep 90
date
python3 - <<'PY'
from pathlib import Path
import json, urllib.request, time

def log_tail(name, n=25):
    p=Path(f'/root/.pm2/logs/{name}-out.log')
    lines=p.read_text(errors='replace').splitlines()
    # only since last ACCOUNT lock / this boot
    idx=0
    for i,l in enumerate(lines):
        if '[ACCOUNT LOCK]' in l or '[ACCOUNT] index=' in l:
            idx=i
    return lines[idx:]

def stamps():
    out={}
    for t in ['C01','C03','C05']:
        try:
            d=json.loads(urllib.request.urlopen(f'http://127.0.0.1:3201/predict/get-table-by-name?tableName={t}', timeout=5).read())
            x=d.get('table') or d
            r=(x.get('totalRound') or [{}])[-1]
            out[t]={
                'status': x.get('statusGame'),
                'id': r.get('id'),
                'stamp': r.get('stampTime'),
                'pred': r.get('roadRandom'),
                'res': r.get('roadFormat'),
            }
        except Exception as e:
            out[t]=str(e)
    return out

def summarize(tag):
    print('====', tag, '====')
    for name, label in [('session-sexy-1','NS1'),('session-sexy-2','NS2')]:
        c=log_tail(name)
        fw=[l for l in c if '[HALL FORWARD]' in l]
        miss=[l for l in c if '[HALL MISS]' in l]
        enter=[l for l in c if 'skip enter' in l or 'AUTO ENTER' in l or 'ĐÃ VÀO THẲNG' in l]
        cap=[l for l in c if 'Sending session' in l or 'SESSION CAPTURE' in l]
        wd=[l for l in c if '[WATCHDOG]' in l]
        lobby=[l for l in c if 'Ở sảnh' in l or 'lobby —' in l]
        print(label, 'lines', len(c), 'forward', len(fw), 'fresh', sum(1 for l in fw if 'fresh=1' in l),
              'miss', len(miss), 'wd', len(wd), 'lobby', len(lobby), 'enterHits', len(enter), 'sessCap', len(cap))
        for l in fw[-4:]:
            print(' ', l[-160:])
        for l in c[-6:]:
            if '[HALL FORWARD]' not in l:
                print('  *', l[-160:])
    print('STAMPS', json.dumps(stamps(), ensure_ascii=False))

summarize('T1')
print('--- wait 120s for new rounds ---')
time.sleep(120)
summarize('T2')
PY
echo
pm2 jlist | python3 -c "import sys,json,time;d=json.load(sys.stdin);now=time.time()*1000
for p in d:
  if 'session_sexy' in p['name']:
    e=p['pm2_env']; print(p['name'], e.get('status'), 'up_s', int((now-e.get('pm_uptime',now))/1000), 'rst', e.get('restart_time'))"
`;

const c = new Client();
c.on("ready", () => {
  c.exec(cmd, (e, s) => {
    let o = "";
    s.on("data", (d) => (o += d.toString()));
    s.stderr.on("data", (d) => (o += d.toString()));
    s.on("close", (code) => {
      console.log(o || "(empty)");
      console.log("exit", code);
      c.end();
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
