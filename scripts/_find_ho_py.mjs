import { Client } from "ssh2";

const cmd = `
cd /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main
grep -n "HÔ BLOCK\\|capture thật\\|không phải ảnh\\|WAIT BÀN\\|dự đoán\\|predict" bot.py | head -40
echo '===='
# maybe in modules
grep -rn "HÔ BLOCK\\|capture thật\\|không phải ảnh" . --include='*.py' 2>/dev/null | head -40
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
