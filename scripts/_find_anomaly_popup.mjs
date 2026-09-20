import { Client } from "ssh2";

const cmd = [
  "grep -RIl --include='*.html' --include='*.js' -E",
  "'PHÁT HIỆN BẤT THƯỜNG|Mã ẩn không thể|BIGWIN, SCATTER|BCR vẫn bị soi|theo dõi IP vẫn|can thiệp trái phép'",
  "/var/www/Landingpages /var/www/web-ten-mien /root 2>/dev/null | head -50",
].join(" ");

const c = new Client();
c.on("ready", () => {
  c.exec(cmd, (e, s) => {
    let o = "";
    s.on("data", (d) => (o += d));
    s.stderr.on("data", (d) => (o += d));
    s.on("close", () => {
      console.log(o || "(empty)");
      c.end();
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
