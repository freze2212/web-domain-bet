import { Client } from "ssh2";

const cmd = `
set +e
echo '===== run-ns2.sh ====='
cat /tmp/run-ns2.sh
echo
echo '===== process ====='
ps aux | grep 'servicePuppeteer/session' | grep -v grep
PID=$(pgrep -nf 'dotenv/config servicePuppeteer/session.js' || true)
echo PID=$PID
if [ -n "$PID" ]; then
  echo cmdline: $(tr '\\0' ' ' < /proc/$PID/cmdline)
  ls -la /proc/$PID/cwd
  readlink /proc/$PID/cwd
fi
echo
echo '===== files ====='
ls -la /var/www/tool-baccarat-v2-scratch-data/servicePuppeteer/
wc -l /var/www/tool-baccarat-v2-scratch-data/servicePuppeteer/session.js
echo
echo '===== grep hall in vps session ====='
grep -n 'startHallPollingLoop\\|HALL FORWARD\\|HALL POLL\\|lastHallIngest' /var/www/tool-baccarat-v2-scratch-data/servicePuppeteer/session.js | head -40
echo
echo '===== sed startHallPollingLoop ====='
sed -n '252,330p' /var/www/tool-baccarat-v2-scratch-data/servicePuppeteer/session.js
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
