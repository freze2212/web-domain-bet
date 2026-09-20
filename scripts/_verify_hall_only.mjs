import { Client } from "ssh2";

const cmd = `
export TZ=Asia/Ho_Chi_Minh
echo 'wait 70s for login + lobby...'
sleep 70
date
echo
echo '=== key lines since boot ==='
awk 'BEGIN{p=0} /ACCOUNT\\] index=2|HALL ONLY|AUTO ENTER|HALL FORWARD|HALL POLL|CLICK TABLE|IN ROOM|Frame was detached|ENTER_TABLE/{print}' /root/.pm2/logs/session-sexy-2-out.log | tail -60
echo
echo '=== last 25 ==='
tail -n 25 /root/.pm2/logs/session-sexy-2-out.log
echo
echo '=== active table ==='
curl -sS -m 5 https://tool.toolbcr79.com/api/get-active-table; echo
echo
echo '=== HALL_ONLY env in process? ==='
tr '\\0' '\\n' < /proc/$(pm2 pid session_sexy_2)/environ 2>/dev/null | grep -E 'HALL_ONLY|ACCOUNT_INDEX|SKIP' || true
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
