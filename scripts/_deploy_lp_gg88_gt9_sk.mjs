import fs from "fs";
import path from "path";
import { Client } from "ssh2";
import { execSync } from "child_process";

const root = "c:/FREZE-PRJ/web-tên-miền";
for (const line of fs.readFileSync(path.join(root, ".env"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const i = t.indexOf("=");
  process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const TOK = process.env.CLOUDFLARE_ADMIN_API_TOKEN;
const AID = process.env.CLOUDFLARE_ACCOUNT_ID;
const GH = process.env.GITHUB_TOKEN;
const NAME = "lp-gg88-gt9-sk";
const REPO = "freze2212/lp-gg88-gt9-sk";
const BRANCH = "master";
const LOCAL = path.join(root, "landing-staging/lp-gg88-gt9-sk");
const VPS_DIR = "/var/www/Landingpages/GG88/lp-gg88-gt9-sk";
const HUB = "/var/www/web-ten-mien";

async function cf(method, p, body) {
  const r = await fetch(`https://api.cloudflare.com/client/v4${p}`, {
    method,
    headers: { Authorization: `Bearer ${TOK}`, "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const j = await r.json();
  return { ok: !!j.success, result: j.result, errors: j.errors || [] };
}

async function gh(method, p, body) {
  const r = await fetch(`https://api.github.com${p}`, {
    method,
    headers: {
      Authorization: `Bearer ${GH}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "hub-lp-gt9",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { ok: r.ok, status: r.status, json: await r.json().catch(() => ({})) };
}

function sshExec(cmd) {
  return new Promise((resolve, reject) => {
    const c = new Client();
    c.on("ready", () => {
      c.exec(cmd, (err, stream) => {
        if (err) return reject(err);
        let out = "";
        stream.on("data", (d) => (out += d));
        stream.stderr.on("data", (d) => (out += d));
        stream.on("close", (code) => {
          c.end();
          resolve({ code, out });
        });
      });
    }).on("error", reject).connect({
      host: "103.146.22.218",
      username: "root",
      password: "admin123@!",
    });
  });
}

function sshUpload(localRel, remoteAbs) {
  return new Promise((resolve, reject) => {
    const c = new Client();
    c.on("ready", () => {
      c.sftp((err, sftp) => {
        if (err) return reject(err);
        const data = fs.readFileSync(path.join(root, localRel));
        const ws = sftp.createWriteStream(remoteAbs);
        ws.on("close", () => {
          c.end();
          resolve();
        });
        ws.on("error", reject);
        ws.end(data);
      });
    }).on("error", reject).connect({
      host: "103.146.22.218",
      username: "root",
      password: "admin123@!",
    });
  });
}

async function ensureGitHubRepo() {
  const check = await gh("GET", `/repos/${REPO}`);
  if (check.ok) {
    console.log("github repo exists");
    return;
  }
  const created = await gh("POST", "/user/repos", {
    name: NAME,
    private: true,
    auto_init: false,
  });
  console.log("create repo", created.ok, created.status, created.json.full_name || created.json.message);
  if (!created.ok && created.status !== 422) process.exit(1);
}

function ensureLocalGitPush() {
  if (!fs.existsSync(path.join(LOCAL, ".git"))) {
    execSync("git init -b master", { cwd: LOCAL, stdio: "inherit" });
  }
  execSync("git add -A", { cwd: LOCAL, stdio: "inherit" });
  try {
    execSync('git diff --cached --quiet', { cwd: LOCAL });
    console.log("no local changes to commit");
  } catch {
    execSync('git commit -m "feat: GG88 GT9 video LP gg88sk.com"', { cwd: LOCAL, stdio: "inherit" });
  }
  const remote = `https://${GH}@github.com/${REPO}.git`;
  try {
    execSync(`git remote get-url origin`, { cwd: LOCAL, stdio: "pipe" });
    execSync(`git remote set-url origin ${remote}`, { cwd: LOCAL, stdio: "inherit" });
  } catch {
    execSync(`git remote add origin ${remote}`, { cwd: LOCAL, stdio: "inherit" });
  }
  execSync("git push -u origin master --force", { cwd: LOCAL, stdio: "inherit" });
  console.log("git push ok");
}

async function ensurePagesProject() {
  const exists = await cf("GET", `/accounts/${AID}/pages/projects/${NAME}`);
  if (exists.ok) {
    console.log("pages project exists", exists.result?.source?.config);
    return;
  }
  const [owner, repo] = REPO.split("/");
  const created = await cf("POST", `/accounts/${AID}/pages/projects`, {
    name: NAME,
    production_branch: BRANCH,
    source: {
      type: "github",
      config: {
        owner,
        repo_name: repo,
        production_branch: BRANCH,
        deployments_enabled: true,
        production_deployments_enabled: true,
        pr_comments_enabled: false,
        preview_deployment_setting: "none",
      },
    },
  });
  console.log("create pages", created.ok, created.errors);
  if (!created.ok) process.exit(1);

  const ref = await gh("GET", `/repos/${owner}/${repo}/git/ref/heads/${BRANCH}`);
  if (ref.ok) {
    const parent = ref.json.object.sha;
    const cj = await gh("GET", `/repos/${owner}/${repo}/git/commits/${parent}`);
    const nc = await gh("POST", `/repos/${owner}/${repo}/git/commits`, {
      message: `chore: trigger Pages deploy ${NAME}`,
      tree: cj.json.tree.sha,
      parents: [parent],
    });
    if (nc.ok) {
      await gh("PATCH", `/repos/${owner}/${repo}/git/refs/heads/${BRANCH}`, { sha: nc.json.sha });
    }
  }
}

async function ensureVpsClone() {
  const cmd = `
set -e
mkdir -p /var/www/Landingpages/GG88
if [ -d "${VPS_DIR}/.git" ]; then
  cd "${VPS_DIR}" && git fetch origin && git reset --hard origin/${BRANCH}
else
  rm -rf "${VPS_DIR}"
  git clone https://${GH}@github.com/${REPO}.git "${VPS_DIR}"
fi
echo CLONE_OK
ls -la "${VPS_DIR}" | head -8
`;
  const r = await sshExec(cmd);
  console.log(r.out.trim());
  if (r.code !== 0) process.exit(1);
}

async function deployHubTemplates() {
  await sshUpload("src/templates.js", `${HUB}/src/templates.js`);
  await sshUpload("src/repo-scanner.js", `${HUB}/src/repo-scanner.js`);
  const r = await sshExec(`cd ${HUB} && pm2 restart web-tenmienbet --update-env && echo HUB_OK`);
  console.log(r.out.trim());
}

await ensureGitHubRepo();
ensureLocalGitPush();
await ensurePagesProject();
await ensureVpsClone();
await deployHubTemplates();

console.log("DONE — template lp_gg88_gt9_sk ready on hub");
