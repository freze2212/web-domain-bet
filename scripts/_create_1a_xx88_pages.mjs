import fs from "fs";

for (const line of fs.readFileSync(".env", "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const i = t.indexOf("=");
  process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const TOK = process.env.CLOUDFLARE_ADMIN_API_TOKEN;
const AID = process.env.CLOUDFLARE_ACCOUNT_ID;
const GH = process.env.GITHUB_TOKEN;
const NAME = "lp-1a-xx88-quocte";
const REPO = "freze2212/lp-1a-xx88-quocte";
const BRANCH = "master";

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
      "User-Agent": "hub-1a",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { ok: r.ok, json: await r.json().catch(() => ({})) };
}

const exists = await cf("GET", `/accounts/${AID}/pages/projects/${NAME}`);
if (exists.ok) {
  console.log("already exists", exists.result?.source?.type, exists.result?.source?.config);
} else {
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
  console.log("create", created.ok, created.errors);
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

let deployed = false;
for (let i = 0; i < 40; i++) {
  const deps = await cf(
    "GET",
    `/accounts/${AID}/pages/projects/${encodeURIComponent(NAME)}/deployments?per_page=3`
  );
  const ok = (deps.result || []).find(
    (d) => d.latest_stage?.name === "deploy" && d.latest_stage?.status === "success"
  );
  if (ok) {
    console.log("deploy ok", ok.url);
    deployed = true;
    break;
  }
  const failed = (deps.result || []).find((d) => d.latest_stage?.status === "failure");
  if (failed) {
    console.log("deploy fail stage", failed.latest_stage);
    break;
  }
  await new Promise((r) => setTimeout(r, 5000));
}
if (!deployed) console.log("deploy pending/fail — check CF dashboard");

const meta = await cf("GET", `/accounts/${AID}/pages/projects/${NAME}`);
console.log("final", {
  source: meta.result?.source?.type,
  repo: meta.result?.source?.config
    ? `${meta.result.source.config.owner}/${meta.result.source.config.repo_name}`
    : null,
  branch: meta.result?.source?.config?.production_branch,
});
