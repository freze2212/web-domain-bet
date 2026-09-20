import { Client } from "ssh2";

const cmd = `
export TZ=Asia/Ho_Chi_Minh
sleep 40
date
echo '===== last 35 ====='
tail -n 35 /root/.pm2/logs/session-sexy-2-out.log
echo
curl -sS -m 5 https://tool.toolbcr79.com/api/get-active-table; echo
curl -sS -m 5 https://tool.toolbcr79.com/api/occupied-tables; echo
pm2 list | head -15
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
