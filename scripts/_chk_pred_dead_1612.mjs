import { Client } from "ssh2";

const cmd = `
export TZ=Asia/Ho_Chi_Minh
date
echo '=== active ==='
curl -sS -m 5 https://tool.toolbcr79.com/api/get-active-table; echo
echo
echo '=== session NS2 16:09-16:20 ==='
grep -E '16:0[9-9]|16:1[0-9]|16:2[0-5]|09:1[0-9]|09:2[0-5]|HALL FORWARD|HALL POLL|HALL ONLY|detach|SHUTDOWN|reset|AUTO ENTER|CLEAR|active_table|Error' /root/.pm2/logs/session-sexy-2-out.log | tail -100
echo
echo '=== FORWARD after HALL ONLY ==='
awk '/stay lobby — skip enter table/{p=1} p' /root/.pm2/logs/session-sexy-2-out.log | grep -c 'HALL FORWARD' || true
awk '/stay lobby — skip enter table/{p=1} p' /root/.pm2/logs/session-sexy-2-out.log | grep -E 'HALL FORWARD|HALL POLL|detach|SHUTDOWN|Error' | tail -40
echo
echo '=== last 30 session ==='
tail -n 30 /root/.pm2/logs/session-sexy-2-out.log
echo
echo '=== bot_sexy_2 around 16:10-16:20 ==='
grep -E '16:1[0-9]|16:2[0-5]|09:1[0-9]|HÔ|WAIT|WARM|BLOCK|C03|active|stamp|1789290' /root/.pm2/logs/bot-sexy-2-out.log | tail -50
echo
echo '=== server ingest / predict around stamps ==='
grep -E '1789290727142|1789290691319|1789290656032|1789290618428|ingest-hall|predict|HÒA|16:12|16:11|16:10' /root/.pm2/logs/server-sexy-out.log 2>/dev/null | tail -40
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
