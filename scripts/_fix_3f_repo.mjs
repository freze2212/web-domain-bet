import fs from "fs";
import { Client } from "ssh2";

for (const line of fs.readFileSync(".env", "utf8").split(/\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const i = t.indexOf("=");
  process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const GH = process.env.GITHUB_TOKEN;
const pass = process.env.VPS_PASS || "admin123@!";
const REPO = "freze2212/ladpage-3f-nhannhan";
const PATH_LP = "/var/www/Landingpages/GG88/3f-thanhnhan";

// verify repo exists
const meta = await fetch(`https://api.github.com/repos/${REPO}`, {
  headers: { Authorization: `Bearer ${GH}`, "User-Agent": "hub" },
});
const mj = await meta.json();
console.log("GitHub repo", meta.status, mj.full_name || mj.message);
if (!meta.ok) process.exit(1);

const cmd = `
set -e
REPO='${REPO}'
PATH_LP='${PATH_LP}'
TOKEN='${GH}'
URL="https://x-access-token:\${TOKEN}@github.com/\${REPO}.git"
TS=$(date +%Y%m%d%H%M%S)
if [ -d "$PATH_LP" ]; then
  mv "$PATH_LP" "\${PATH_LP}.wrong-5fg-\$TS"
  echo BACKED_WRONG_TO=\${PATH_LP}.wrong-5fg-\$TS
fi
git clone --depth 1 --branch main "$URL" "$PATH_LP" || git clone --depth 1 "$URL" "$PATH_LP"
git -C "$PATH_LP" remote set-url origin "https://github.com/\${REPO}.git"
test -d "$PATH_LP/.git"
echo FIXED_REMOTE:
git -C "$PATH_LP" remote -v
git -C "$PATH_LP" log -1 --oneline
ls "$PATH_LP" | head -8
`;

const conn = new Client();
conn
  .on("ready", () => {
    conn.exec(cmd, (err, stream) => {
      if (err) {
        console.error(err);
        conn.end();
        process.exit(1);
      }
      stream.on("data", (d) => process.stdout.write(d));
      stream.stderr.on("data", (d) => process.stderr.write(d));
      stream.on("close", (c) => {
        conn.end();
        process.exit(c || 0);
      });
    });
  })
  .connect({ host: "103.146.22.218", username: "root", password: pass, readyTimeout: 30000 });
