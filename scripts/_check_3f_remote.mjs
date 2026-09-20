import { Client } from "ssh2";
import { execSync } from "child_process";
import fs from "fs";

const pass = process.env.VPS_PASS || "admin123@!";
const local3f = "C:\\Landingpages\\GG88\\3f-thanhnhan";
let localRemote = "?";
try {
  localRemote = execSync("git remote get-url origin", { cwd: local3f, encoding: "utf8" }).trim();
} catch (e) {
  localRemote = e.message;
}
console.log("LOCAL 3f remote:", localRemote);

const cmd = `
echo LOCAL_CHECK_DONE
echo '=== VPS 3f-thanhnhan ==='
git -C /var/www/Landingpages/GG88/3f-thanhnhan remote -v 2>&1 | head -3
git -C /var/www/Landingpages/GG88/3f-thanhnhan log -1 --oneline 2>&1
ls /var/www/Landingpages/GG88/3f-thanhnhan 2>&1 | head -10
echo '=== bak ==='
ls -d /var/www/Landingpages/GG88/3f-thanhnhan.bak-* 2>/dev/null | tail -3
echo '=== landing-page-5f ==='
git -C /var/www/Landingpages/GG88/landing-page-5f remote -v 2>&1 | head -2
echo '=== 5uae ==='
git -C /var/www/Landingpages/GG88/ldpape_4d-5-quocgia remote -v 2>&1 | head -2
`;

const conn = new Client();
conn
  .on("ready", () => {
    conn.exec(cmd, (err, stream) => {
      if (err) {
        console.error(err);
        conn.end();
        return;
      }
      stream.on("data", (d) => process.stdout.write(d));
      stream.stderr.on("data", (d) => process.stderr.write(d));
      stream.on("close", () => conn.end());
    });
  })
  .connect({ host: "103.146.22.218", username: "root", password: pass, readyTimeout: 20000 });
