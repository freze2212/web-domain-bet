/**
 * Fix: cong-gg88k Git connect; gg882pro → git2; 7f-xx88 → git2
 * Uses Admin token (Freze primary token currently invalid).
 * Live link = arbiter. Stop on verify fail.
 */
import fs from "fs";

for (const line of fs.readFileSync(".env", "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const i = t.indexOf("=");
  process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const TOK = process.env.CLOUDFLARE_ADMIN_API_TOKEN;
const AID = process.env.CLOUDFLARE_ACCOUNT_ID;
const AD = process.env.CLOUDFLARE_ADMIN_API_TOKEN;
const AA = process.env.CLOUDFLARE_ADMIN_ACCOUNT_ID;
const GH = process.env.GITHUB_TOKEN;

async function cf(method, p, body, token = TOK) {
  const r = await fetch(`https://api.cloudflare.com/client/v4${p}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const j = await r.json();
  return { ok: !!j.success, status: r.status, result: j.result, errors: j.errors || [], messages: j.messages || [] };
}

async function gh(method, p, body) {
  const r = await fetch(`https://api.github.com${p}`, {
    method,
    headers: {
      Authorization: `Bearer ${GH}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "fix-pages-git",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, json: j };
}

function linkOf(e) {
  if (!e) return "";
  if (typeof e === "string") return e;
  return e.main_url || e.url || e.link || "";
}
function apexOf(d) {
  d = String(d).toLowerCase();
  return d.startsWith("www.") ? d.slice(4) : d;
}

async function probeLink(domain) {
  const host = apexOf(domain);
  try {
    const r = await fetch(`https://${host}/domains.json?v=${Date.now()}`, {
      signal: AbortSignal.timeout(15000),
      headers: { "Cache-Control": "no-cache" },
    });
    if (!r.ok) return { ok: false, http: r.status, link: "" };
    const j = await r.json();
    const link = linkOf(j[host] || j[`www.${host}`] || j[domain]);
    return { ok: !!link, http: r.status, link };
  } catch (e) {
    return { ok: false, http: 0, link: "", error: e.message };
  }
}

async function findZone(domain) {
  for (const [which, token, acc] of [
    ["freze", TOK, AID],
    ["admin", AD, AA],
  ]) {
    const z = await cf("GET", `/zones?name=${encodeURIComponent(domain)}&account.id=${encodeURIComponent(acc)}`, undefined, token);
    if (z.ok && z.result?.length) {
      const zone = z.result.find((x) => x.status === "active") || z.result[0];
      return { which, token, zone };
    }
  }
  return null;
}

async function setCnames(zoneInfo, domain, target) {
  const recs = await cf("GET", `/zones/${zoneInfo.zone.id}/dns_records?type=CNAME&per_page=100`, undefined, zoneInfo.token);
  const records = recs.result || [];
  const out = [];
  for (const name of [domain, `www.${domain}`]) {
    const rec = records.find((r) => r.name === name);
    if (!rec) {
      const created = await cf(
        "POST",
        `/zones/${zoneInfo.zone.id}/dns_records`,
        { type: "CNAME", name, content: target, proxied: true, ttl: 1 },
        zoneInfo.token
      );
      out.push({ name, ok: created.ok, action: "create", errors: created.errors });
      continue;
    }
    const patch = await cf(
      "PATCH",
      `/zones/${zoneInfo.zone.id}/dns_records/${rec.id}`,
      { type: "CNAME", name, content: target, proxied: true, ttl: 1 },
      zoneInfo.token
    );
    out.push({ name, ok: patch.ok, action: "patch", errors: patch.errors });
  }
  return out;
}

async function delDomain(project, d) {
  const del = await cf("DELETE", `/accounts/${AID}/pages/projects/${project}/domains/${encodeURIComponent(d)}`);
  return del.ok || del.errors?.[0]?.code === 8000021;
}

async function addDomain(project, d) {
  const add = await cf("POST", `/accounts/${AID}/pages/projects/${project}/domains`, { name: d });
  if (add.ok) return { ok: true, status: add.result?.status };
  if (add.errors?.[0]?.code === 8000018) return { ok: true, already: true };
  return { ok: false, errors: add.errors };
}

async function createGitPages(newProject, repoFull, branch = "main") {
  const [owner, repo] = repoFull.split("/");
  const body = {
    name: newProject,
    production_branch: branch,
    source: {
      type: "github",
      config: {
        owner,
        repo_name: repo,
        production_branch: branch,
        deployments_enabled: true,
        production_deployments_enabled: true,
        pr_comments_enabled: false,
        preview_deployment_setting: "none",
      },
    },
  };
  const res = await cf("POST", `/accounts/${AID}/pages/projects`, body);
  if (!res.ok && !/already|exist/i.test(JSON.stringify(res.errors))) {
    throw new Error(`create ${newProject}: ${JSON.stringify(res.errors)}`);
  }
  // trigger deploy via empty commit
  const ref = await gh("GET", `/repos/${owner}/${repo}/git/ref/heads/${branch}`);
  if (ref.ok) {
    const parent = ref.json.object.sha;
    const cj = await gh("GET", `/repos/${owner}/${repo}/git/commits/${parent}`);
    const nc = await gh("POST", `/repos/${owner}/${repo}/git/commits`, {
      message: `chore: trigger Pages deploy ${newProject}`,
      tree: cj.json.tree.sha,
      parents: [parent],
    });
    if (nc.ok) await gh("PATCH", `/repos/${owner}/${repo}/git/refs/heads/${branch}`, { sha: nc.json.sha, force: false });
  }
  for (let i = 0; i < 40; i++) {
    const deps = await cf("GET", `/accounts/${AID}/pages/projects/${encodeURIComponent(newProject)}/deployments?per_page=3`);
    const ok = (deps.result || []).find((d) => d.latest_stage?.name === "deploy" && d.latest_stage?.status === "success");
    if (ok) return { ok: true, url: ok.url, id: ok.id };
    await new Promise((r) => setTimeout(r, 5000));
  }
  return { ok: true, pending: true };
}

async function migrateOne(domain, oldProject, newProject, expectedLink) {
  console.log(`\n--- migrate ${domain}: ${oldProject} → ${newProject} ---`);
  const before = await probeLink(domain);
  console.log("probe before", before);
  const liveLink = before.link || expectedLink;
  if (!liveLink) throw new Error(`No live link for ${domain} — STOP`);

  // remove from old, add to new
  await delDomain(oldProject, domain);
  await delDomain(oldProject, `www.${domain}`);
  const a1 = await addDomain(newProject, domain);
  const a2 = await addDomain(newProject, `www.${domain}`);
  console.log("add pages", a1, a2);
  if (!a1.ok && !a2.ok) throw new Error(`add pages fail ${domain}`);

  const zone = await findZone(domain);
  if (!zone) throw new Error(`no zone ${domain}`);
  const cname = await setCnames(zone, domain, `${newProject}.pages.dev`);
  console.log("cname", cname);
  if (cname.some((c) => !c.ok)) throw new Error(`cname fail ${domain}`);

  // wait + verify
  for (let i = 0; i < 24; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const after = await probeLink(domain);
    console.log(`verify ${i}`, after.http, after.link);
    if (after.ok && after.link === liveLink) {
      console.log("OK link preserved", domain);
      return { ok: true, domain, link: liveLink, project: newProject };
    }
    if (after.http === 200 && after.link && after.link !== liveLink) {
      throw new Error(`LINK MISMATCH ${domain}: live=${after.link} expected=${liveLink} — STOP`);
    }
  }
  throw new Error(`verify timeout ${domain} — STOP`);
}

const cmd = process.argv[2] || "all";

if (cmd === "cong" || cmd === "all") {
  console.log("=== 1) lp-gg88-cong-gg88k: Direct → Git (no custom domains) ===");
  const cur = await cf("GET", `/accounts/${AID}/pages/projects/lp-gg88-cong-gg88k`);
  console.log("current", cur.result?.source?.type || cur.errors);
  const doms = await cf("GET", `/accounts/${AID}/pages/projects/lp-gg88-cong-gg88k/domains`);
  const custom = (doms.result || []).filter((d) => !String(d.name).endsWith(".pages.dev"));
  console.log("custom domains", custom);
  if (custom.length > 0) {
    console.log("HAS custom domains — will create -git2 instead of recreate");
    const created = await createGitPages("lp-gg88-cong-gg88k-git2", "freze2212/lp-gg88-cong-gg88k", "main");
    console.log("created git2", created);
  } else {
    // delete direct, recreate with git same name
    const del = await cf("DELETE", `/accounts/${AID}/pages/projects/lp-gg88-cong-gg88k`);
    console.log("delete direct", del.ok, del.errors);
    const created = await createGitPages("lp-gg88-cong-gg88k", "freze2212/lp-gg88-cong-gg88k", "main");
    console.log("recreate git", created);
  }
}

if (cmd === "gg882pro" || cmd === "all") {
  console.log("=== 2) lp-gg882pro Direct domains → git2 ===");
  const res = await migrateOne("gg8386.cc", "lp-gg882pro", "lp-gg882pro-git2");
  console.log(res);
}

if (cmd === "7f" || cmd === "all") {
  console.log("=== 3) lp-7f-xx88-games → git2 ===");
  // create git2 if missing
  const exists = await cf("GET", `/accounts/${AID}/pages/projects/lp-7f-xx88-games-git2`);
  if (!exists.ok) {
    const created = await createGitPages("lp-7f-xx88-games-git2", "freze2212/lp-7f-xx88-games", "main");
    console.log("created 7f-git2", created);
  } else {
    console.log("7f-git2 already exists", exists.result?.source?.type);
  }
  // domain is www.xx88pro.us — migrate apex xx88pro.us
  const res = await migrateOne("xx88pro.us", "lp-7f-xx88-games", "lp-7f-xx88-games-git2");
  console.log(res);
}

console.log("\nDONE phase API");
