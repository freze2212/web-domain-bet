import { Client } from "ssh2";
const c = new Client();
c.on("ready", () => {
  c.exec(
    `
SRC=/var/www/Landingpages/LLWIN/lp-llwin-info
ls "$SRC" | head -50
echo '---GREP---'
grep -nE 'Hoa|Thụy|Thuy|HOA|THỤY|us\\.png|Switzerland|QC\\.jpg|BCR|Đức|Pháp' "$SRC/index.html" | head -50
echo '---IMGS---'
ls "$SRC"/*.{png,jpg,jpeg,webp,svg} 2>/dev/null
echo '---REMOTE---'
git -C "$SRC" remote -v | head -2
`,
    (e, s) => {
      let o = "";
      s.on("data", (d) => (o += d));
      s.stderr.on("data", (d) => (o += d));
      s.on("close", () => {
        console.log(o);
        c.end();
      });
    }
  );
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
