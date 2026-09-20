import { Client } from "ssh2";

const cmd = `
python3 - <<'PY'
from pathlib import Path
p=Path('/var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js')
t=p.read_text(encoding='utf-8')
old='''  const MISS_MS = Number(process.env.HALL_MISS_HAND_MS || 70000);
  const BOOT_MS = Number(process.env.HALL_BOOT_GRACE_MS || 90000);
  setInterval(() => {
    if (resetInFlight) return;
'''
new='''  setInterval(() => {
    if (resetInFlight) return;
    const MISS_MS = Number(process.env.HALL_MISS_HAND_MS || 70000) + Math.max(0, accountIdx - 1) * 35000;
    const BOOT_MS = Number(process.env.HALL_BOOT_GRACE_MS || 90000) + Math.max(0, accountIdx - 1) * 20000;
'''
if old not in t:
    raise SystemExit('miss block missing or already changed')
p.write_text(t.replace(old,new,1), encoding='utf-8')
print('stagger written (applies after next process restart)')
PY
# confirm supervisor gone + no capture session
pm2 jlist | python3 -c "import sys,json;d=json.load(sys.stdin); print([p['name'] for p in d])"
test ! -f /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/hall-supervisor.js && echo 'hall-supervisor.js removed'
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
