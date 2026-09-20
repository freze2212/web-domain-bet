import { Client } from "ssh2";

const cmd = `
BAK=/var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js.bak-hall-recover-1789289241562
echo '=== enterTargetTable start ==='
sed -n '3138,3160p' "$BAK"
echo
echo '=== sendSessionData ==='
sed -n '3950,3975p' "$BAK"
echo
echo '=== force_reenter head ==='
sed -n '4008,4040p' "$BAK"
echo
echo '=== captureTableRound start ==='
sed -n '3692,3715p' "$BAK"
echo
echo '=== pm2 list ==='
pm2 jlist | python3 -c "import sys,json; d=json.load(sys.stdin);
[print(p['name'], p['pm2_env']['status'], p['pm2_env'].get('pm_cwd'), p['pm2_env'].get('pm_exec_path')) for p in d]"
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
