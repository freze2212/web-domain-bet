/**
 * Deploy hub code to VPS via git pull (keeps remote .env + data/).
 * Env: VPS_HOST, VPS_USER, VPS_PASSWORD (or VPS_PASS), optional VPS_DIR, PM2_NAME
 */
import { Client } from "ssh2";

const host = process.env.VPS_HOST || "103.146.22.218";
const username = process.env.VPS_USER || "root";
const password = process.env.VPS_PASSWORD || process.env.VPS_PASS || "";
const dir = process.env.VPS_DIR || "/var/www/web-ten-mien";
const pm2Name = process.env.PM2_NAME || "web-tenmienbet";
const repo = process.env.GIT_REPO || "https://github.com/freze2212/web-domain-.git";

if (!password) {
  console.error("Thiếu VPS_PASSWORD / VPS_PASS");
  process.exit(1);
}

const remoteScript = `
set -e
DIR="${dir}"
REPO="${repo}"
PM2="${pm2Name}"

if [ -d "$DIR/.git" ]; then
  echo "[VPS] git pull in $DIR"
  cd "$DIR"
  git remote set-url origin "$REPO" || true
  git fetch origin
  git checkout main 2>/dev/null || git checkout -b main
  git reset --hard origin/main
elif [ -d "$DIR" ]; then
  echo "[VPS] convert existing folder to git clone (preserve .env + data)"
  TS=$(date +%Y%m%d%H%M%S)
  BAK="/var/www/web-ten-mien.bak-$TS"
  mv "$DIR" "$BAK"
  git clone "$REPO" "$DIR"
  if [ -f "$BAK/.env" ]; then cp -a "$BAK/.env" "$DIR/.env"; echo "[VPS] restored .env"; fi
  if [ -d "$BAK/data" ]; then rm -rf "$DIR/data"; cp -a "$BAK/data" "$DIR/data"; echo "[VPS] restored data/"; fi
  cd "$DIR"
else
  echo "[VPS] fresh clone"
  mkdir -p "$(dirname "$DIR")"
  git clone "$REPO" "$DIR"
  cd "$DIR"
fi

cd "$DIR"
npm install --omit=dev
pm2 restart "$PM2" || pm2 start src/server.js --name "$PM2"
pm2 save || true
echo "[VPS] DONE"
pwd
git log -1 --oneline
pm2 show "$PM2" | head -n 20 || true
`;

const conn = new Client();
conn
  .on("ready", () => {
    console.log(`[Deploy] SSH ok → ${host}, pulling ${repo}`);
    conn.exec(remoteScript, (err, stream) => {
      if (err) {
        console.error(err);
        conn.end();
        process.exit(1);
      }
      stream.on("data", (d) => process.stdout.write(d.toString()));
      stream.stderr.on("data", (d) => process.stderr.write(d.toString()));
      stream.on("close", (code) => {
        conn.end();
        process.exit(code || 0);
      });
    });
  })
  .on("error", (err) => {
    console.error("[Deploy] SSH error:", err.message);
    process.exit(1);
  })
  .connect({ host, port: 22, username, password });
