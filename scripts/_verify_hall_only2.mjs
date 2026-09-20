import { Client } from "ssh2";

const cmd = `
sleep 45
echo '=== post-boot 45s check ==='
# only lines after HALL ONLY marker
awk '/stay lobby — skip enter table/{p=1} p' /root/.pm2/logs/session-sexy-2-out.log | grep -E 'HALL FORWARD|HALL POLL|AUTO ENTER|CLICK TABLE|detach|HALL ONLY' | tail -40
echo
echo FORWARD_COUNT=$(awk '/stay lobby — skip enter table/{p=1} p' /root/.pm2/logs/session-sexy-2-out.log | grep -c 'HALL FORWARD' || true)
echo DETACH_COUNT=$(awk '/stay lobby — skip enter table/{p=1} p' /root/.pm2/logs/session-sexy-2-out.log | grep -c 'detached' || true)
echo ENTER_COUNT=$(awk '/stay lobby — skip enter table/{p=1} p' /root/.pm2/logs/session-sexy-2-out.log | grep -c 'AUTO ENTER\\|CLICK TABLE' || true)
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
