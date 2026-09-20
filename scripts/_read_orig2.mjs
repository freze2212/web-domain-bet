import { Client } from "ssh2";

const cmd = `
BAK=/var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js.bak-hall-recover-1789289241562
echo '=== ingestHallTableItems ==='
sed -n '1469,1600p' "$BAK"
echo
echo '=== AUTO ENTER block ==='
sed -n '860,920p' "$BAK"
echo
echo '=== resetMain ==='
grep -n "function resetMain\\|async function resetMain\\|process.exit\\|lastCapturedSessionId\\|captureSession\\|screenshot" "$BAK" | head -40
echo
echo '=== enter after login ==='
sed -n '3870,4060p' "$BAK"
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
