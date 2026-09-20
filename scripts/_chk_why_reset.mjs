import { Client } from "ssh2";

const cmd = `
export TZ=Asia/Ho_Chi_Minh
date
echo '=== who calls closeHard resetMain ==='
grep -n "closeHard\\|resetMain" /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js | head -40
echo
echo '=== err around reset ==='
tail -n 30 /root/.pm2/logs/session-sexy-2-error.log
echo
echo '=== out around 16:54 ==='
grep -E '16:5[3-9]|17:0|KEEPALIVE|WATCHDOG|resetMain|HALL ONLY|lobby-only|FORWARD|SHUTDOWN|KICK|expired|FATAL' /root/.pm2/logs/session-sexy-2-out.log | tail -50
echo
echo '=== active ==='
curl -sS -m 5 https://tool.toolbcr79.com/api/get-active-table; echo
echo '=== localhost C03 ==='
curl -sS -m 5 'http://127.0.0.1:3201/predict/get-table-by-name?tableName=C03' | python3 -c "import sys,json;d=json.loads(sys.stdin.read());t=d.get('table')or d;r=(t.get('totalRound')or[])[-1];print(t.get('statusGame'),r.get('id'),r.get('stampTime'))"
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
