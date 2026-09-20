import { Client } from "ssh2";

const cmd = `
python3 - <<'PY'
import json, urllib.request, time
def snap():
    out={}
    for t in ['C01','C03','C05']:
        d=json.loads(urllib.request.urlopen(f'http://127.0.0.1:3201/predict/get-table-by-name?tableName={t}', timeout=5).read())
        x=d.get('table') or d
        r=(x.get('totalRound') or [{}])[-1]
        out[t]=(x.get('statusGame'), r.get('id'), r.get('stampTime'), r.get('roadRandom'), r.get('roadFormat'))
    return out
a=snap(); print('A', a)
time.sleep(25)
b=snap(); print('B', b)
for t in a:
    print(t, 'moved' if a[t][1]!=b[t][1] or a[t][2]!=b[t][2] else 'FROZEN', a[t], '->', b[t])
PY
echo '--- ns2 now ---'
tail -n 8 /root/.pm2/logs/session-sexy-2-out.log
echo '--- ns1 now ---'
tail -n 8 /root/.pm2/logs/session-sexy-1-out.log
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
