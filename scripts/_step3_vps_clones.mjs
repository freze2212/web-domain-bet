/**
 * Step 3: Replace VPS Landingpages template folders with git clones.
 * Does NOT modify GitHub / live links — only replaces local VPS working trees.
 */
import fs from "fs";
import path from "path";
import { Client } from "ssh2";
import { ACTIVE_TEMPLATES } from "../src/templates.js";
import { execSync } from "child_process";

for (const line of fs.readFileSync(".env", "utf8").split(/\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const i = t.indexOf("=");
  process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const GH = process.env.GITHUB_TOKEN;
const VPS_PASS = process.env.VPS_PASS || process.env.VPS_PASSWORD || "admin123@!";

function localRemote(localPath) {
  try {
    if (!fs.existsSync(path.join(localPath, ".git"))) return null;
    return execSync("git remote get-url origin", { cwd: localPath, encoding: "utf8" })
      .trim()
      .replace(/\.git$/i, "")
      .replace(/^https?:\/\/[^@]+@github\.com\//i, "")
      .replace(/^https?:\/\/github\.com\//i, "");
  } catch {
    return null;
  }
}

const jobs = [];
for (const t of ACTIVE_TEMPLATES) {
  const linux = `/var/www/Landingpages/${t.brand || ""}/${t.folder || path.basename(t.path)}`.replace(
    /\/+/g,
    "/"
  );
  const repo = t.gitRepo || localRemote(t.path);
  if (!repo) {
    jobs.push({ id: t.id, linux, repo: null, skip: "no-repo" });
    continue;
  }
  jobs.push({ id: t.id, linux, repo, skip: null });
}

// Deduplicate by linux path (keep first)
const seen = new Set();
const uniqueJobs = [];
for (const j of jobs) {
  if (seen.has(j.linux)) continue;
  seen.add(j.linux);
  uniqueJobs.push(j);
}

const payload = JSON.stringify(uniqueJobs);
const remoteScript = `
set -e
GH_TOKEN='${GH}'
python3 <<'PY'
import json, os, subprocess, time, shutil
jobs = json.loads('''${payload.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}''')
results = []
for j in jobs:
    item = dict(j)
    path = j["linux"]
    repo = j.get("repo")
    if j.get("skip") or not repo:
        item["status"] = "SKIP"
        item["detail"] = j.get("skip") or "no-repo"
        results.append(item)
        continue
    os.makedirs(os.path.dirname(path), exist_ok=True)
    ts = time.strftime("%Y%m%d%H%M%S")
    bak = None
    if os.path.isdir(path):
        if os.path.isdir(os.path.join(path, ".git")):
            # already git — fetch/reset to origin/main
            try:
                subprocess.check_call(["git", "-C", path, "remote", "set-url", "origin", f"https://x-access-token:{os.environ.get('GH_TOKEN','')}@github.com/{repo}.git"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                subprocess.check_call(["git", "-C", path, "fetch", "origin"], stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
                subprocess.check_call(["git", "-C", path, "checkout", "main"], stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
                subprocess.check_call(["git", "-C", path, "reset", "--hard", "origin/main"], stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
                item["status"] = "UPDATED"
                item["detail"] = "already-git reset origin/main"
                results.append(item)
                continue
            except Exception as e:
                item["status"] = "FAIL_UPDATE"
                item["detail"] = str(e)
                results.append(item)
                continue
        bak = path + ".bak-" + ts
        os.rename(path, bak)
        item["backup"] = bak
    url = f"https://x-access-token:{os.environ['GH_TOKEN']}@github.com/{repo}.git"
    try:
        subprocess.check_call(["git", "clone", "--depth", "1", "--branch", "main", url, path], stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
        # scrub token from remote url
        subprocess.check_call(["git", "-C", path, "remote", "set-url", "origin", f"https://github.com/{repo}.git"])
        # ensure push credentials via insteadOf or leave https — hub will need token in URL or credential
        # Store helper: rewrite origin with token for server-side pushes (file mode 600)
        netrc = "/root/.netrc"
        # configure git credential store for github
        subprocess.check_call(["git", "-C", path, "config", "credential.helper", "store"])
        has_git = os.path.isdir(os.path.join(path, ".git"))
        item["status"] = "CLONED" if has_git else "FAIL"
        item["detail"] = "ok" if has_git else "missing .git after clone"
        item["has_git"] = has_git
    except Exception as e:
        item["status"] = "FAIL_CLONE"
        item["detail"] = str(e)[:300]
        if bak and os.path.isdir(bak) and not os.path.isdir(path):
            os.rename(bak, path)
            item["detail"] += " | restored backup"
    results.append(item)

# write github credentials once for pushes
os.makedirs("/root", exist_ok=True)
with open("/root/.netrc", "w") as f:
    f.write(f"machine github.com\\nlogin x-access-token\\npassword {os.environ['GH_TOKEN']}\\n")
os.chmod("/root/.netrc", 0o600)

print(json.dumps({"results": results}, ensure_ascii=False))
PY
`;

function sshExec(cmd) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let out = "";
    let err = "";
    conn
      .on("ready", () => {
        conn.exec(cmd, { env: { GH_TOKEN: GH } }, (e, stream) => {
          // ssh2 exec env may not pass — embed token in script already
          if (e) {
            conn.end();
            reject(e);
            return;
          }
          stream.on("data", (d) => (out += d.toString()));
          stream.stderr.on("data", (d) => (err += d.toString()));
          stream.on("close", (code) => {
            conn.end();
            resolve({ out, err, code });
          });
        });
      })
      .on("error", reject)
      .connect({ host: "103.146.22.218", port: 22, username: "root", password: VPS_PASS, readyTimeout: 60000 });
  });
}

console.log(`Jobs: ${uniqueJobs.length} template paths`);
// Simpler approach: write jobs json to temp and scp via base64 in bash
const b64 = Buffer.from(JSON.stringify(uniqueJobs)).toString("base64");
const bash = `
set -e
export GH_TOKEN='${GH.replace(/'/g, "'\\''")}'
echo '${b64}' | base64 -d > /tmp/lp_clone_jobs.json
python3 <<'PY'
import json, os, subprocess, time
jobs = json.load(open("/tmp/lp_clone_jobs.json"))
token = os.environ["GH_TOKEN"]
results = []
for j in jobs:
    item = dict(j)
    path = j["linux"]
    repo = j.get("repo")
    if j.get("skip") or not repo:
        item["status"] = "SKIP"
        item["detail"] = j.get("skip") or "no-repo"
        results.append(item)
        print(item["status"], item["id"], item["detail"])
        continue
    os.makedirs(os.path.dirname(path), exist_ok=True)
    ts = time.strftime("%Y%m%d%H%M%S")
    bak = None
    url = f"https://x-access-token:{token}@github.com/{repo}.git"
    if os.path.isdir(path) and os.path.isdir(os.path.join(path, ".git")):
        try:
            subprocess.check_call(["git", "-C", path, "remote", "set-url", "origin", url])
            subprocess.check_call(["git", "-C", path, "fetch", "origin"], stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
            subprocess.call(["git", "-C", path, "checkout", "main"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            subprocess.check_call(["git", "-C", path, "reset", "--hard", "origin/main"], stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
            subprocess.check_call(["git", "-C", path, "remote", "set-url", "origin", f"https://github.com/{repo}.git"])
            item["status"] = "UPDATED"
            item["detail"] = "reset origin/main"
            item["has_git"] = True
        except Exception as e:
            item["status"] = "FAIL_UPDATE"
            item["detail"] = str(e)[:300]
            item["has_git"] = True
        results.append(item)
        print(item["status"], item["id"], item.get("detail",""))
        continue
    if os.path.isdir(path):
        bak = path + ".bak-" + ts
        os.rename(path, bak)
        item["backup"] = bak
    try:
        subprocess.check_call(["git", "clone", "--depth", "1", "--branch", "main", url, path], stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
        subprocess.check_call(["git", "-C", path, "remote", "set-url", "origin", f"https://github.com/{repo}.git"])
        item["status"] = "CLONED"
        item["has_git"] = os.path.isdir(os.path.join(path, ".git"))
        item["detail"] = "ok"
    except Exception as e:
        item["status"] = "FAIL_CLONE"
        item["detail"] = str(e)[:300]
        item["has_git"] = False
        if bak and os.path.isdir(bak) and not os.path.exists(path):
            os.rename(bak, path)
            item["detail"] += " | restored"
    results.append(item)
    print(item["status"], item["id"], item.get("detail",""))

# netrc for future pushes
open("/root/.netrc","w").write(f"machine github.com\\nlogin x-access-token\\npassword {token}\\n")
os.chmod("/root/.netrc", 0o600)
open("/tmp/lp_clone_results.json","w").write(json.dumps({"results": results}, ensure_ascii=False, indent=2))
print("DONE", len(results))
PY
cat /tmp/lp_clone_results.json
`;

const { out, err, code } = await sshExec(bash);
if (err) console.error(err.slice(-500));
const start = out.indexOf('{"results"');
const end = out.lastIndexOf("}") + 1;
if (start >= 0) {
  const report = JSON.parse(out.slice(start, end));
  fs.writeFileSync("data/_step3_vps_git_clones.json", JSON.stringify(report, null, 2));
  const st = {};
  for (const r of report.results) st[r.status] = (st[r.status] || 0) + 1;
  console.log("STATUS", st);
  console.log("Saved data/_step3_vps_git_clones.json");
} else {
  console.log(out.slice(-2000));
  process.exit(code || 1);
}
