import { Client } from "ssh2";

const cmd = `
python3 - <<'PY'
from pathlib import Path
p=Path('/var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js')
t=p.read_text(encoding='utf-8')
old='''setInterval(async () => {
  if (
    watchdogResetting ||
    !page ||
    resetInFlight ||
    shutdownInFlight
  ) {
    return;
  }
  const staleMs = Date.now() - lastSessionProgressAt;
'''
new='''setInterval(async () => {
  return; // chỉ reset khi miss 1 ván hall (startMissedRoundWatch)
  if (
    watchdogResetting ||
    !page ||
    resetInFlight ||
    shutdownInFlight
  ) {
    return;
  }
  const staleMs = Date.now() - lastSessionProgressAt;
'''
if 'chỉ reset khi miss 1 ván hall' in t:
    print('watchdog already disabled')
elif old not in t:
    raise SystemExit('watchdog block missing')
else:
    p.write_text(t.replace(old,new,1), encoding='utf-8')
    print('watchdog disabled')
PY
echo '=== restart both (stagger) ==='
pm2 restart session_sexy_1 --update-env
sleep 10
pm2 restart session_sexy_2 --update-env
pm2 save
echo done
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
