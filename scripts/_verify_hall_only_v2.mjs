import { Client } from "ssh2";

const cmd = `
export TZ=Asia/Ho_Chi_Minh
echo 'wait 75s...'
sleep 75
date
echo
echo '=== active ==='
curl -sS -m 5 'https://tool.toolbcr79.com/api/get-active-table?ns=NS2'; echo
curl -sS -m 5 'https://tool.toolbcr79.com/api/get-active-table'; echo
echo
echo '=== since v2 boot ==='
awk '/stay lobby — track=/{p=1} p' /root/.pm2/logs/session-sexy-2-out.log | grep -E 'HALL ONLY|API NOTIFY|HALL FORWARD|HALL POLL|AUTO ENTER|CLICK TABLE|detach|track=' | tail -50
echo
echo COUNTS:
awk '/stay lobby — track=/{p=1} p' /root/.pm2/logs/session-sexy-2-out.log | awk '
/HALL FORWARD/{f++}
/HALL POLL LOBBY/{p++}
/detach/{d++}
/API NOTIFY/{n++}
END{print "FORWARD="f+0,"POLL="p+0,"DETACH="d+0,"NOTIFY="n+0}
'
echo
echo '=== bot last 15 ==='
tail -n 15 /root/.pm2/logs/bot-sexy-2-out.log
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
