import { Client } from "ssh2";

const cmd = `
export TZ=Asia/Ho_Chi_Minh
set -e
echo '===== BEFORE ====='
date
pm2 list | sed -n '1,20p'
echo
echo '===== RESTART session_sexy_2 ====='
pm2 restart session_sexy_2 --update-env
sleep 8
echo
echo '===== STATUS AFTER ====='
pm2 show session_sexy_2 | sed -n '1,35p'
echo
echo '===== recent session2 logs ====='
pm2 logs session_sexy_2 --lines 40 --nostream 2>/dev/null | tail -60
echo
echo '===== API check ====='
curl -sS -m 8 https://tool.toolbcr79.com/api/get-active-table || true
echo
curl -sS -m 8 https://tool.toolbcr79.com/api/occupied-tables || true
echo
echo
echo '===== wait 25s for browser boot then recheck logs ====='
sleep 25
pm2 logs session_sexy_2 --lines 50 --nostream 2>/dev/null | tail -70
echo
echo '===== detach/logout last 2 min? ====='
tail -n 80 /root/.pm2/logs/session-sexy-2-out.log | grep -E 'detached|SESSION_EXPIRED|IN-TABLE|login|TABLE|ready|NS2' | tail -30
tail -n 30 /root/.pm2/logs/server-sexy-error-0.log | grep -E 'AUTO-LOGOUT|ingest|error' | tail -15
echo
pm2 list
free -h
`;

const c = new Client();
c.on("ready", () => {
  c.exec(cmd, { pty: true }, (e, s) => {
    let o = "";
    s.on("data", (d) => (o += d.toString()));
    s.stderr.on("data", (d) => (o += d.toString()));
    s.on("close", (code) => {
      console.log(o || "(empty)");
      process.exit(code || 0);
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
