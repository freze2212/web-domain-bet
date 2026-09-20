/**
 * Sync CF Pages branch main + redeploy LP without defaultLink
 */
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { Client } from "ssh2";

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
const LOCAL = path.join(root, "landing-staging/lp-gg88-gt9-sk");

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
      "User-Agent": "hub-gt9-sync",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { ok: r.ok, json: await r.json().catch(() => ({})) };
}

// Ensure local domains.json has no defaultLink
const dj = JSON.parse(fs.readFileSync(path.join(LOCAL, "domains.json"), "utf8"));
delete dj.defaultLink;
delete dj.default_link;
fs.writeFileSync(path.join(LOCAL, "domains.json"), JSON.stringify(dj, null, 2) + "\n");

execSync("git add domains.json index.html", { cwd: LOCAL, stdio: "inherit" });
try {
  execSync("git diff --cached --quiet", { cwd: LOCAL });
} catch {
  execSync('git commit -m "chore: strip defaultLink from domains.json"', { cwd: LOCAL, stdio: "inherit" });
  execSync(`git push origin main`, { cwd: LOCAL, stdio: "inherit" });
}

// Point CF Pages to main branch
const patch = await cf("PATCH", `/accounts/${AID}/pages/projects/${NAME}`, {
  source: {
    type: "github",
    config: {
      owner: "freze2212",
      repo_name: "lp-gg88-gt9-sk",
      production_branch: "main",
      deployments_enabled: true,
      production_deployments_enabled: true,
    },
  },
});
console.log("patch branch", patch.ok, patch.errors);

// Trigger deploy via empty commit on main
const ref = await gh("GET", `/repos/${REPO}/git/ref/heads/main`);
if (ref.ok) {
  const parent = ref.json.object.sha;
  const cj = await gh("GET", `/repos/${REPO}/git/commits/${parent}`);
  const nc = await gh("POST", `/repos/${REPO}/git/commits`, {
    message: "chore: trigger Pages redeploy main",
    tree: cj.json.tree.sha,
    parents: [parent],
  });
  if (nc.ok) {
    await gh("PATCH", `/repos/${REPO}/git/refs/heads/main`, { sha: nc.json.sha });
    console.log("trigger commit ok");
  }
}

for (let i = 0; i < 30; i++) {
  const deps = await cf("GET", `/accounts/${AID}/pages/projects/${NAME}/deployments?per_page=2`);
  const d = (deps.result || [])[0];
  console.log(i, d?.deployment_trigger?.metadata?.branch, d?.latest_stage?.name, d?.latest_stage?.status);
  if (d?.latest_stage?.name === "deploy" && d?.latest_stage?.status === "success") break;
  if (d?.latest_stage?.status === "failure") break;
  await new Promise((r) => setTimeout(r, 5000));
}

function sshExec(cmd) {
  return new Promise((resolve, reject) => {
    const c = new Client();
    c.on("ready", () => {
      c.exec(cmd, (err, s) => {
        if (err) return reject(err);
        let o = "";
        s.on("data", (d) => (o += d));
        s.stderr.on("data", (d) => (o += d));
        s.on("close", () => {
          c.end();
          resolve(o);
        });
      });
    }).on("error", reject).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
  });
}

const out = await sshExec(`
cd /var/www/Landingpages/GG88/lp-gg88-gt9-sk && git fetch origin && git reset --hard origin/main
echo '--- VPS domains.json ---'
cat domains.json
echo '--- live pages.dev ---'
curl -s https://lp-gg88-gt9-sk.pages.dev/domains.json | head -c 350
echo
echo '--- live gg88sk ---'
curl -s https://gg88sk.com/domains.json | head -c 350
`);
console.log(out);
console.log("DONE");
