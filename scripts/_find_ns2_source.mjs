import { Client } from "ssh2";

const cmd = `
echo '===== run-ns2.sh ====='
cat /tmp/run-ns2.sh
echo
echo '===== pm2 cwd / exec ====='
pm2 show session_sexy_2 | grep -iE 'script|cwd|exec|interpreter|args'
echo
echo '===== find HALL POLL on disk ====='
grep -RIl 'HALL POLL IN-TABLE' /var/www /tmp /root 2>/dev/null | head -20
echo
echo '===== find startHallPollingLoop ====='
grep -RIl 'startHallPollingLoop' /var/www/tool-baccarat-v2-scratch-data 2>/dev/null | head -10
echo
# show VPS short session.js hall poll
sed -n '240,340p' /var/www/tool-baccarat-v2-scratch-data/servicePuppeteer/session.js
echo
echo '===== which node is running ====='
ps aux | grep -E 'session.js|run-ns2' | grep -v grep
tr '\\0' ' ' < /proc/$(pgrep -f 'servicePuppeteer/session.js' | head -1)/cmdline; echo
ls -la /proc/$(pgrep -f 'servicePuppeteer/session.js' | head -1)/cwd
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
