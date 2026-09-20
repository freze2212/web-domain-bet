import { Client } from "ssh2";

const cmd = `
# find HÔ BLOCK / capture thật in bot
grep -rn "không phải ảnh capture\\|HÔ BLOCK\\|capture thật\\|skip.*predict\\|dự đoán" /var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main --include='*.js' 2>/dev/null | head -40
echo '---'
# also tool path
pm2 show bot_sexy_2 | grep -E 'script path|exec cwd'
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
