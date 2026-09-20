import { Client } from "ssh2";

const cmd = `
export TZ=Asia/Ho_Chi_Minh
echo '===== wait more for enter table ====='
sleep 40
date
echo
echo '===== latest session2 out ====='
tail -n 60 /root/.pm2/logs/session-sexy-2-out.log
echo
echo '===== latest session2 err ====='
tail -n 20 /root/.pm2/logs/session-sexy-2-error.log
echo
echo '===== AUTO-LOGOUT after restart? ====='
grep 'Hall API AUTO-LOGOUT' /root/.pm2/logs/server-sexy-error-0.log | tail -5
echo 'count since 14:28:'
awk '$0 >= "2026-09-13 14:28" && /Hall API AUTO-LOGOUT/' /root/.pm2/logs/server-sexy-error-0.log | wc -l
echo
echo '===== API ====='
curl -sS -m 8 https://tool.toolbcr79.com/api/get-active-table; echo
curl -sS -m 8 https://tool.toolbcr79.com/api/occupied-tables; echo
echo
pm2 list | head -20
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
