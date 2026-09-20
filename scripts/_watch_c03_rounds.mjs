import { Client } from "ssh2";

const cmd = `
export TZ=Asia/Ho_Chi_Minh
date
echo '=== C03 table API ==='
curl -sS -m 8 'https://tool.toolbcr79.com/predict/get-table-by-name?tableName=C03' | python3 -c "
import sys,json
raw=sys.stdin.read()
try:
  d=json.loads(raw)
except Exception as e:
  print('PARSE_FAIL', e, raw[:300]); raise SystemExit
# compact
if isinstance(d, dict):
  t=d.get('table') or d.get('data') or d
  if isinstance(t, dict):
    rounds=t.get('totalRound') or t.get('rounds') or []
    print('keys', list(t.keys())[:20])
    if isinstance(rounds, list) and rounds:
      last=rounds[-5:]
      for r in last:
        if isinstance(r, dict):
          print({k:r.get(k) for k in ('id','winner','stampTime','result','player','banker') if k in r or True})
        else:
          print(r)
      print('LAST_STAMP', rounds[-1].get('stampTime') if isinstance(rounds[-1],dict) else None)
      print('N_ROUNDS', len(rounds))
    else:
      print('no rounds', type(rounds), str(d)[:400])
  else:
    print(str(d)[:500])
else:
  print(type(d), str(d)[:400])
"
echo
echo '=== FORWARD timestamps recent ==='
grep 'HALL FORWARD' /root/.pm2/logs/session-sexy-2-out.log | tail -5
echo '=== last session lines with time ==='
tail -n 15 /root/.pm2/logs/session-sexy-2-out.log
echo
echo '=== bot FE sync / HO last 15 ==='
grep -E 'FE SYNC|HÔ RANDOM|WAIT TABLE|stamp=|THẮNG|THUA|HÒA|Timeout' /root/.pm2/logs/bot-sexy-2-out.log | tail -20
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
