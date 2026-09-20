import { Client } from "ssh2";

const cmd = `
export TZ=Asia/Ho_Chi_Minh
date
echo '=== since 17:03:23 lobby ==='
python3 - <<'PY'
from pathlib import Path
lines=Path('/root/.pm2/logs/session-sexy-2-out.log').read_text(errors='replace').splitlines()
idx=0
for i,l in enumerate(lines):
  if '17:03:23' in l and 'HALL ONLY' in l: idx=i
  if 'lobby-only — hall ingest 24/7' in l: idx=i
chunk=lines[idx:]
print('lines_since', len(chunk))
for l in chunk:
  print(l[-200:])
print('FORWARD', sum(1 for l in chunk if 'HALL FORWARD' in l))
print('POLL', sum(1 for l in chunk if 'POLL' in l))
print('KEEP', [l for l in chunk if 'KEEPALIVE' in l][-5:])
PY
echo
echo '=== err recent ==='
tail -n 8 /root/.pm2/logs/session-sexy-2-error.log
echo
echo '=== stamps ==='
for t in C01 C03 C05 C02; do
  curl -sS -m 4 "http://127.0.0.1:3201/predict/get-table-by-name?tableName=$t" | python3 -c "import sys,json;d=json.loads(sys.stdin.read());x=d.get('table')or d;r=(x.get('totalRound')or[{}])[-1];print('$t', x.get('statusGame'), r.get('id'), r.get('stampTime'))"
done
echo
sleep 20
date
echo '=== after 20s log tail ==='
tail -n 20 /root/.pm2/logs/session-sexy-2-out.log
echo '=== stamps2 ==='
for t in C01 C03 C05; do
  curl -sS -m 4 "http://127.0.0.1:3201/predict/get-table-by-name?tableName=$t" | python3 -c "import sys,json;d=json.loads(sys.stdin.read());x=d.get('table')or d;r=(x.get('totalRound')or[{}])[-1];print('$t', x.get('statusGame'), r.get('id'), r.get('stampTime'))"
done
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
