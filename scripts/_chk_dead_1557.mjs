import { Client } from "ssh2";

const cmd = `
export TZ=Asia/Ho_Chi_Minh
echo '=== time ==='
date
echo
echo '=== active table ==='
curl -sS -m 5 https://tool.toolbcr79.com/api/get-active-table; echo
echo
echo '=== out around 15:57 ==='
grep -E '15:5[5-9]|16:0[0-2]|15:57|15:58|15:59|HALL FORWARD|HALL AUTO|IN ROOM|active_table|resetMain|SHUTDOWN|AUTO-LOGOUT|detach|Frame|Execution context|ERROR|BÀN|CLICK|NOTIFY|ready' /root/.pm2/logs/session-sexy-2-out.log 2>/dev/null | tail -80
echo
echo '=== err around 15:57 ==='
grep -E '15:5[5-9]|16:0[0-2]|HALL|detach|AUTO|LOGOUT|reset|Error|error|SIGINT|uncaught' /root/.pm2/logs/session-sexy-2-error.log 2>/dev/null | tail -60
echo
echo '=== last 30 out ==='
tail -n 30 /root/.pm2/logs/session-sexy-2-out.log
echo
echo '=== last 20 err ==='
tail -n 20 /root/.pm2/logs/session-sexy-2-error.log
echo
echo '=== server_sexy around bet id / 15:57 ==='
grep -E '1789289842243|15:57:2|15:57:3|15:58|hô|announce|THUA|PLAYER|BANKER' /root/.pm2/logs/server-sexy-out.log 2>/dev/null | tail -40
grep -E '1789289842243|15:57' /root/.pm2/logs/server-sexy-error.log 2>/dev/null | tail -20
echo
echo '=== bot_sexy_2 around 15:57 ==='
grep -E '15:57|15:58|15:59|16:00|hô|THUA|1789289842243|C03' /root/.pm2/logs/bot-sexy-2-out.log 2>/dev/null | tail -40
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
