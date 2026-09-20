/**
 * Fix stuck rebase on VPS 5uae clone → sync origin/main cleanly
 */
import { Client } from "ssh2";

const pass = process.env.VPS_PASS || "admin123@!";
const cmd = `
set -e
cd /var/www/Landingpages/GG88/ldpape_4d-5-quocgia
echo "BEFORE:"
git status -sb || true
git rebase --abort 2>/dev/null || true
git merge --abort 2>/dev/null || true
# stash any local dirty
git stash push -u -m "auto-stash-before-sync-$(date +%s)" 2>/dev/null || true
git fetch origin
git checkout main 2>/dev/null || git checkout -B main origin/main
git reset --hard origin/main
git clean -fd
echo "AFTER:"
git status -sb
git log -1 --oneline
git rev-parse HEAD
git rev-parse origin/main
# confirm autotest entry from origin
node -e "const fs=require('fs');const j=JSON.parse(fs.readFileSync('domains.json','utf8'));const e=j['autotest-6888.top'];console.log('autotest', typeof e==='string'?e:(e&&e.main_url));"
echo GIT_SYNC_OK
`;

const c = new Client();
c.on("ready", () => {
  c.exec(cmd, (err, stream) => {
    if (err) throw err;
    stream.on("data", (d) => process.stdout.write(d));
    stream.stderr.on("data", (d) => process.stderr.write(d));
    stream.on("close", (code) => {
      c.end();
      process.exit(code || 0);
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: pass });
