import { Client } from "ssh2";

const cmd = `
export TZ=Asia/Ho_Chi_Minh
echo 'wait 50s for login+table...'
sleep 50
date
echo
echo '===== last 40 session ====='
tail -n 40 /root/.pm2/logs/session-sexy-2-out.log
echo
echo '===== API ====='
curl -sS -m 5 https://tool.toolbcr79.com/api/get-active-table; echo
curl -sS -m 5 https://tool.toolbcr79.com/api/occupied-tables; echo
echo
echo '===== patch markers in file ====='
grep -n 'HALL AUTO-RECOVER\\|maybeRecoverStaleHall\\|hallDetachStreak\\|KHÔNG cập nhật lastSessionProgressAt' /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js | head -20
echo
# confirm heartbeat no longer fakes progress
python3 - <<'PY'
from pathlib import Path
t=Path('/var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js').read_text()
i=t.find('function startActiveTableHeartbeat')
print(t[i:i+450])
PY
`;

const c = new Client();
c.on("ready", () => {
  c.exec(cmd, { pty: true }, (e, s) => {
    let o = "";
    s.on("data", (d) => (o += d.toString()));
    s.stderr.on("data", (d) => (o += d.toString()));
    s.on("close", () => {
      console.log(o || "(empty)");
      c.end();
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
