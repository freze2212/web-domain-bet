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
const OLD = "lp-7f-xx88-games";
const NEW = "lp-7f-xx88-games-git2";
const REPO = "freze2212/lp-7f-xx88-games";
const LIVE_HOST = "www.xx88pro.us";
const APEX = "xx88pro.us";
const EXPECT = "https://xx88e10e01qc.xx88.one/register.html";

async function cf2(method, p, body, token = TOK) {
  const r = await fetch(`https://api.cloudflare.com/client/v4${p}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const j = await r.json();
  return { ok: !!j.success, status: r.status, result: j.result, errors: j.errors || [] };
}

async function gh(method, p, body) {
  const r = await fetch(`https://api.github.com${p}`, {
    method,
    headers: {
      Authorization: `Bearer ${GH}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "fix-7f",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { ok: r.ok, status: r.status, json: await r.json().catch(() => ({})) };
}

function linkOf(e) {
  if (!e) return "";
  if (typeof e === "string") return e;
  return e.main_url || e.url || e.link || "";
}

async function probeWww() {
  const r = await fetch(`https://${LIVE_HOST}/domains.json?v=${Date.now()}`, {
    signal: AbortSignal.timeout(15000),
    headers: { "Cache-Control": "no-cache" },
  });
  if (!r.ok) return { ok: false, http: r.status, link: "" };
  const j = await r.json();
  const link = linkOf(j[LIVE_HOST] || j[APEX]);
  return { ok: !!link, http: r.status, link };
}

const before = await probeWww();
console.log("probe before", before);
if (!before.ok || before.link !== EXPECT) throw new Error("unexpected live link — STOP");

let exists = await cf2("GET", `/accounts/${AID}/pages/projects/${NEW}`);
if (!exists.ok) {
  console.log("create git2...");
  const [owner, repo] = REPO.split("/");
  const created = await cf2("POST", `/accounts/${AID}/pages/projects`, {
    name: NEW,
    production_branch: "main",
    source: {
      type: "github",
      config: {
        owner,
        repo_name: repo,
        production_branch: "main",
        deployments_enabled: true,
        production_deployments_enabled: true,
        pr_comments_enabled: false,
        preview_deployment_setting: "none",
      },
    },
  });
  console.log("create", created.ok, created.errors);
  if (!created.ok) throw new Error("create fail: " + JSON.stringify(created.errors));

  const ref = await gh("GET", `/repos/${owner}/${repo}/git/ref/heads/main`);
  if (ref.ok) {
    const parent = ref.json.object.sha;
    const cj = await gh("GET", `/repos/${owner}/${repo}/git/commits/${parent}`);
    const nc = await gh("POST", `/repos/${owner}/${repo}/git/commits`, {
      message: `chore: trigger Pages deploy ${NEW}`,
      tree: cj.json.tree.sha,
      parents: [parent],
    });
    if (nc.ok) {
      await gh("PATCH", `/repos/${owner}/${repo}/git/refs/heads/main`, { sha: nc.json.sha });
    }
  }

  let deployed = false;
  for (let i = 0; i < 40; i++) {
    const deps = await cf2(
      "GET",
      `/accounts/${AID}/pages/projects/${encodeURIComponent(NEW)}/deployments?per_page=3`
    );
    const ok = (deps.result || []).find(
      (d) => d.latest_stage?.name === "deploy" && d.latest_stage?.status === "success"
    );
    if (ok) {
      console.log("deploy ok", ok.url);
      deployed = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  if (!deployed) console.log("deploy still pending — continue if pages.dev serves");
} else {
  console.log("git2 already", exists.result?.source?.type);
}

const pd = await fetch(`https://${NEW}.pages.dev/domains.json?v=${Date.now()}`, {
  signal: AbortSignal.timeout(20000),
});
const pj = pd.ok ? await pd.json() : null;
console.log("git2 pages.dev json", pd.status, {
  www: linkOf(pj?.[LIVE_HOST]),
  apex: linkOf(pj?.[APEX]),
});
if (linkOf(pj?.[LIVE_HOST]) !== EXPECT && linkOf(pj?.[APEX]) !== EXPECT) {
  throw new Error("git2 domains.json missing/wrong link — STOP");
}

for (const d of [LIVE_HOST, APEX]) {
  await cf2("DELETE", `/accounts/${AID}/pages/projects/${OLD}/domains/${encodeURIComponent(d)}`);
}
for (const d of [LIVE_HOST, APEX]) {
  const add = await cf2("POST", `/accounts/${AID}/pages/projects/${NEW}/domains`, { name: d });
  const already = add.errors?.[0]?.code === 8000018;
  console.log("add", d, add.ok || already, add.errors);
}

async function findZone(domain) {
  for (const [which, token, acc] of [
    ["freze", TOK, AID],
    ["admin", AD, AA],
  ]) {
    const z = await cf2(
      "GET",
      `/zones?name=${encodeURIComponent(domain)}&account.id=${encodeURIComponent(acc)}`,
      undefined,
      token
    );
    if (z.ok && z.result?.length) {
      const zone = z.result.find((x) => x.status === "active") || z.result[0];
      return { which, token, zone };
    }
  }
  return null;
}

const zone = await findZone(APEX);
if (!zone) throw new Error("no zone xx88pro.us");
console.log("zone", zone.which, zone.zone.id, zone.zone.status);

const recs = await cf2(
  "GET",
  `/zones/${zone.zone.id}/dns_records?type=CNAME&per_page=100`,
  undefined,
  zone.token
);
const records = recs.result || [];
const target = `${NEW}.pages.dev`;
for (const name of [APEX, LIVE_HOST]) {
  const rec = records.find((r) => r.name === name);
  if (!rec) {
    const created = await cf2(
      "POST",
      `/zones/${zone.zone.id}/dns_records`,
      { type: "CNAME", name, content: target, proxied: true, ttl: 1 },
      zone.token
    );
    console.log("cname create", name, created.ok, created.errors);
  } else {
    const patch = await cf2(
      "PATCH",
      `/zones/${zone.zone.id}/dns_records/${rec.id}`,
      { type: "CNAME", name, content: target, proxied: true, ttl: 1 },
      zone.token
    );
    console.log("cname patch", name, patch.ok, patch.errors, "was", rec.content);
  }
}

let ok = false;
for (let i = 0; i < 30; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  const after = await probeWww();
  console.log("verify", i, after);
  if (after.ok && after.link === EXPECT) {
    ok = true;
    break;
  }
  if (after.http === 200 && after.link && after.link !== EXPECT) {
    throw new Error("LINK MISMATCH — STOP");
  }
}
if (!ok) throw new Error("verify timeout — STOP");

const del = await cf2("DELETE", `/accounts/${AID}/pages/projects/${OLD}`);
console.log("delete Direct", del.ok, del.errors);

const gone = await cf2("GET", `/accounts/${AID}/pages/projects/${OLD}`);
console.log("direct gone", !gone.ok);

const final = await probeWww();
console.log("FINAL probe", final);
console.log("DONE");
