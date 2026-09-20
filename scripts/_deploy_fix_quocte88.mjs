import { Client } from "ssh2";
import fs from "fs";

const files = [
  ["c:/FREZE-PRJ/web-tên-miền/src/templates.js", "/var/www/web-ten-mien/src/templates.js"],
];

const c = new Client();
c.on("ready", () => {
  c.sftp((err, sftp) => {
    if (err) throw err;
    let i = 0;
    const next = () => {
      if (i >= files.length) {
        const cmd = `
grep -n 'KHÔNG bao giờ git reset --hard\\|origin/master\\|show-ref' /var/www/web-ten-mien/src/templates.js | head -15
cd /var/www/web-ten-mien
set -a; . ./.env; set +a
# fix quocte88.us link into mx (safe merge, no reset)
node --input-type=module <<'NODE'
import fs from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import { getTemplate } from "./src/templates.js";
import { assignDomain } from "./src/ownership.js";
import { updateHistoryItem, addHistoryItem } from "./src/history.js";

const execAsync = promisify(exec);
const domain = "quocte88.us";
const link = "https://gg8846.com/?id=618277496";
const tele = link;
const template = getTemplate("lp_gg88_mx");
if (!template?.path) throw new Error("missing mx template");
const tplPath = template.path;
const djPath = tplPath + "/domains.json";

await execAsync("git fetch origin", { cwd: tplPath });
const show = await execAsync("git show-ref", { cwd: tplPath });
const refs = show.stdout || "";
const remoteRef = refs.includes("refs/remotes/origin/main") ? "origin/main" : "origin/master";
const localBranch = remoteRef.endsWith("/main") ? "main" : "master";

let remoteObj = {}, localObj = {};
try { remoteObj = JSON.parse((await execAsync("git show " + remoteRef + ":domains.json", { cwd: tplPath })).stdout || "{}"); } catch {}
try { localObj = JSON.parse(fs.readFileSync(djPath, "utf8")); } catch {}

const entry = { main_url: link, messenger_url: tele, telegram_url: tele };
const dj = { ...remoteObj, ...localObj };
dj[domain] = entry;
dj["www." + domain] = entry;
fs.writeFileSync(djPath, JSON.stringify(dj, null, 2));

await execAsync("git checkout " + localBranch, { cwd: tplPath }).catch(() => {});
await execAsync("git merge --no-edit -X ours " + remoteRef, { cwd: tplPath }).catch(async () => {
  await execAsync("git merge --abort", { cwd: tplPath }).catch(() => {});
});
// re-apply after merge
let again = {};
try { again = JSON.parse(fs.readFileSync(djPath, "utf8")); } catch {}
const finalDj = { ...remoteObj, ...again };
finalDj[domain] = entry;
finalDj["www." + domain] = entry;
fs.writeFileSync(djPath, JSON.stringify(finalDj, null, 2));

await execAsync("git add domains.json", { cwd: tplPath });
await execAsync('git commit -m "Fix link for domain ' + domain + '"', { cwd: tplPath }).catch(() => {});
await execAsync("git push origin " + localBranch, { cwd: tplPath });
console.log("PUSHED", domain, link);

assignDomain(domain, "u_admin", {
  mode: "LP",
  currentLink: link,
  tele,
  templateId: template.id,
  templateName: template.name,
  cnameTarget: template.cnameTarget,
});

addHistoryItem({
  id: "hist_" + Date.now() + "_fixq",
  domain,
  actionType: "SET_LINK",
  actionLabel: "Sửa link sau SWITCH_TPL fail",
  templateId: template.id,
  templateName: template.name,
  cnameTarget: template.cnameTarget,
  link,
  tele,
  status: "success",
  userId: "u_admin",
  username: "admin",
  details: { reason: "domains.json missing after failed git reset origin/main" },
});
console.log("OWNERSHIP_OK");
NODE

# restart hub to load templates.js fix
pm2 restart web-tenmienbet --update-env
sleep 3
pm2 describe web-tenmienbet | grep -E 'status|uptime|pid' | head -8

echo '=== VERIFY LIVE (wait pages deploy ~25s) ==='
sleep 25
for i in 1 2 3 4 5; do
  link=$(curl -sS -A 'Mozilla/5.0' --max-time 20 "https://quocte88.us/domains.json?v=$RANDOM" | python3 -c "import sys,json;j=json.load(sys.stdin);e=j.get('quocte88.us') or j.get('www.quocte88.us') or {}; print(e.get('main_url') or 'MISSING')" 2>/dev/null || echo ERR)
  echo "try $i: $link"
  echo "$link" | grep -q '618277496' && break
  sleep 15
done
curl -sI -A 'Mozilla/5.0' --max-time 15 https://quocte88.us/ | head -8
`;
        c.exec(cmd, (e2, stream) => {
          let o = "";
          stream.on("data", (d) => (o += d.toString()));
          stream.stderr.on("data", (d) => (o += d.toString()));
          stream.on("close", () => {
            console.log(o);
            c.end();
          });
        });
        return;
      }
      const [local, remote] = files[i++];
      const ws = sftp.createWriteStream(remote);
      ws.on("close", () => {
        console.log("up", remote);
        next();
      });
      ws.end(fs.readFileSync(local));
    };
    next();
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
