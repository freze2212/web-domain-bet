import { Client } from "ssh2";

const cmd = `
python3 - <<'PY'
from pathlib import Path
p=Path('/var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js')
t=p.read_text(encoding='utf-8')
old='''  lastHallIngestAt = Date.now();
  const stamp = maxTableRoadStamp(tableItems);
'''
new='''  lastHallIngestAt = Date.now();
  lastSessionProgressAt = Date.now();
  const stamp = maxTableRoadStamp(tableItems);
'''
if old not in t:
    raise SystemExit('block missing')
if 'lastSessionProgressAt = Date.now();\\n  const stamp' in t:
    print('already patched')
else:
    p.write_text(t.replace(old,new,1), encoding='utf-8')
    print('patched progress')
PY
echo '=== ns2 tail ==='
tail -n 20 /root/.pm2/logs/session-sexy-2-out.log
echo '=== ns1 forward recent ==='
grep '\\[HALL FORWARD\\]' /root/.pm2/logs/session-sexy-1-out.log | tail -n 8
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
