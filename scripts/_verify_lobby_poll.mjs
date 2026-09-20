import { Client } from "ssh2";

const cmd = `
export TZ=Asia/Ho_Chi_Minh
echo 'wait 85s login...'
sleep 85
date
python3 - <<'PY'
from pathlib import Path
import json, urllib.request, time, re

def boot(name):
    lines=Path(f'/root/.pm2/logs/{name}-out.log').read_text(errors='replace').splitlines()
    idx=0
    for i,l in enumerate(lines):
        if '[ACCOUNT] index=' in l or 'poll sảnh mỗi 2s' in l or 'BẮT ĐẦU CHƯƠNG TRÌNH FIREFOX' in l:
            if '2026-09-13 18:5' in l or '2026-09-13 19:' in l or '[ACCOUNT]' in l or 'poll sảnh' in l:
                idx=i
    # last firefox start today after 18:53
    for i,l in enumerate(lines):
        if 'BẮT ĐẦU CHƯƠNG TRÌNH FIREFOX' in l and '2026-09-13 18:5' in l:
            idx=i
        if 'BẮT ĐẦU CHƯƠNG TRÌNH FIREFOX' in l and '2026-09-13 19:' in l:
            idx=i
    return lines[idx:]

def stats(tag):
    print('====', tag, '====')
    for name,label in [('session-sexy-1','NS1'),('session-sexy-2','NS2')]:
        c=boot(name)
        fw=[l for l in c if '[HALL FORWARD]' in l]
        miss=[l for l in c if '[HALL MISS]' in l]
        dead=[l for l in c if 'HALL POLL DEAD' in l or 'HALL POLL FAIL' in l]
        poll=[l for l in c if 'poll sảnh' in l or 'lobby — poll' in l]
        print(label, 'fw', len(fw), 'miss70', len(miss), 'pollFail', len(dead), 'pollStart', len(poll))
        for l in (fw[-5:] + [x for x in c if 'POLL' in x or 'Ở sảnh' in x or 'ĐĂNG NHẬP' in x or 'VÀO SẢNH' in x][-4:]):
            print(' ', l[-170:])
    try:
        d=json.loads(urllib.request.urlopen('http://127.0.0.1:3201/predict/get-table-by-name?tableName=C06', timeout=5).read())
        x=d.get('table') or d
        r=(x.get('totalRound') or [{}])[-1]
        print('C06', x.get('statusGame'), 'id', r.get('id'), 'stamp', r.get('stampTime'), 'pred', r.get('roadRandom'), 'res', r.get('roadFormat'))
    except Exception as e:
        print('C06 ERR', e)

stats('T1')
print('--- wait 90s ---')
time.sleep(90)
stats('T2')
PY
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
