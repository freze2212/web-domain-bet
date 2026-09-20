import { Client } from "ssh2";

const cmd = `
cd /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main
echo '=== README / package ==='
ls -la README* package.json 2>/dev/null | head
head -80 README.md 2>/dev/null || head -40 README*.md 2>/dev/null || true
echo
echo '=== server routes (api) ==='
grep -n "app\\.(get\\|post\\|put)\\|router\\.\\|ingest-hall\\|predict\\|notify-active\\|get-active\\|screenshot\\|place.bet" server.js | head -60
echo
echo '=== FE title / main tabs ==='
ls public 2>/dev/null | head -30
grep -rn "LỊCH SỬ\\|Hall\\|Sảnh\\|ingest\\|predict\\|hô\\|BCR" public --include='*.html' --include='*.js' --include='*.vue' 2>/dev/null | head -40
echo
echo '=== bot.py docstring / main flow header ==='
head -80 bot.py
echo '---'
grep -n "FLOW\\|HO_VIA\\|ingest\\|hall\\|chức năng\\|mục đích\\|MAIN" bot.py | head -30
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
