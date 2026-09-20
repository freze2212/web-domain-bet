/**
 * Process remaining LP clusters ONE BY ONE.
 * Each: baseline probe → backup+git clone VPS path → re-probe → STOP on mismatch.
 * Skips lp_gg88_vip_2 (already done).
 */
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { Client } from "ssh2";
import { ACTIVE_TEMPLATES } from "../src/templates.js";
import { config } from "../src/config.js";
import { cfRequest, getAllPagesProjectsForAccount } from "../src/cloudflare.js";

for (const line of fs.readFileSync(".env", "utf8").split(/\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const i = t.indexOf("=");
  process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const GH = process.env.GITHUB_TOKEN;
const VPS_PASS = process.env.VPS_PASS || "admin123@!";
const SKIP_IDS = new Set(["lp_gg88_vip_2"]); // done

function localRemote(p) {
  try {
    if (!fs.existsSync(path.join(p, ".git"))) return null;
    return execSync("git remote get-url origin", { cwd: p, encoding: "utf8" })
      .trim()
      .replace(/\.git$/i, "")
      .replace(/^https?:\/\/[^@]+@github\.com\//i, "")
      .replace(/^https?:\/\/github\.com\//i, "");
  } catch {
    return null;
  }
}

function linkOf(e) {
  if (!e) return "";
  if (typeof e === "string") return e.trim();
  return String(e.main_url || e.url || e.link || "").trim();
}
function normLink(u) {
  return String(u || "")
    .trim()
    .replace(/\/$/, "")
    .toLowerCase();
}

async function probe(domain) {
  try {
    const r = await fetch(`https://${domain}/domains.json?cb=${Date.now()}`, {
      signal: AbortSignal.timeout(12000),
      headers: { "cache-control": "no-cache" },
    });
    if (r.ok) {
      const j = await r.json();
      const link = linkOf(j[domain] || j[`www.${domain}`]);
      if (link) return { ok: true, link, via: "domains.json" };
    }
  } catch {}
  try {
    const r = await fetch(`https://${domain}/`, { redirect: "manual", signal: AbortSignal.timeout(10000) });
    const loc = r.headers.get("location") || "";
    if (r.status >= 300 && r.status < 400 && loc && !loc.toLowerCase().includes(domain)) {
      return { ok: true, link: loc, via: "302" };
    }
    if (r.status === 200) return { ok: true, link: "", via: "lp-200", bare: true };
    return { ok: false, link: "", via: `http-${r.status}` };
  } catch (e) {
    return { ok: false, link: "", via: e.cause?.code || e.message };
  }
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length || 1) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    })
  );
  return out;
}

function ssh(cmd) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let out = "";
    let err = "";
    conn
      .on("ready", () => {
        conn.exec(cmd, (e, stream) => {
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
      .connect({ host: "103.146.22.218", username: "root", password: VPS_PASS, readyTimeout: 60000 });
  });
}

function pagesFamilyNames(pagesProject) {
  const want = String(pagesProject || "").replace(/\.pages\.dev$/i, "").trim();
  const root = want.replace(/-\d+$/, "");
  return { want, root };
}

const allPages = await getAllPagesProjectsForAccount(config.cloudflare.accountId());
const acc = config.cloudflare.accountId();

const clusters = [];
for (const t of ACTIVE_TEMPLATES) {
  if (SKIP_IDS.has(t.id)) continue;
  const repo = t.gitRepo || localRemote(t.path);
  if (!repo) {
    console.log("SKIP (no repo):", t.id);
    continue;
  }
  const linux = `/var/www/Landingpages/${t.brand || ""}/${t.folder || path.basename(t.path)}`.replace(
    /\/+/g,
    "/"
  );
  clusters.push({
    id: t.id,
    pagesProject: t.pagesProject,
    repo,
    vpsPath: linux,
    brand: t.brand,
  });
}

// dedupe by vpsPath+repo
const seen = new Set();
const unique = [];
for (const c of clusters) {
  const k = c.vpsPath + "|" + c.repo;
  if (seen.has(k)) continue;
  seen.add(k);
  unique.push(c);
}

console.log("Clusters to process:", unique.length);
fs.mkdirSync("data/cluster_runs", { recursive: true });

const summary = [];

for (const cluster of unique) {
  console.log("\n========== CLUSTER", cluster.id, "==========");
  console.log("repo=", cluster.repo, "vps=", cluster.vpsPath, "pagesWant=", cluster.pagesProject);

  const { want, root } = pagesFamilyNames(cluster.pagesProject);
  const family = (allPages || []).filter(
    (p) => p.name === want || p.name === root || p.name.startsWith(root + "-") || p.name.startsWith(want + "-")
  );

  // Only GIT projects with EXACT same repo
  const gitFamily = [];
  for (const p of family) {
    const full = await cfRequest(`/accounts/${acc}/pages/projects/${encodeURIComponent(p.name)}`);
    const typ = (full?.source?.type || "").toLowerCase();
    const repo = full?.source?.config
      ? `${full.source.config.owner}/${full.source.config.repo_name}`
      : null;
    if (typ !== "github" && typ !== "gitlab") {
      console.log("  skip non-git pages:", p.name, typ || "direct");
      continue;
    }
    if (repo !== cluster.repo) {
      console.log("  STOP RISK: pages", p.name, "repo", repo, "!=", cluster.repo, "— skip this pages, do not mix");
      continue;
    }
    gitFamily.push(full);
  }

  const domainSet = new Map();
  for (const p of gitFamily) {
    for (const d of p.domains || []) {
      const name = String(d.name || d)
        .toLowerCase()
        .replace(/^www\./, "");
      if (!name.endsWith(".pages.dev")) domainSet.set(name, p.name);
    }
  }
  const domains = [...domainSet.entries()].map(([domain, pages]) => ({ domain, pages }));
  console.log("  git pages:", gitFamily.map((p) => p.name).join(", ") || "(none on Freze)");
  console.log("  domains on matching git pages:", domains.length);

  // Baseline — if 0 domains, still clone VPS (hub needs .git) but note no live verify list
  let baseline = [];
  if (domains.length > 0) {
    baseline = await pool(domains, 8, async (row) => {
      const live = await probe(row.domain);
      return { ...row, ...live };
    });
  }
  const withLink = baseline.filter((b) => b.ok && b.link);
  console.log("  baseline with link:", withLink.length);

  const baselineFile = `data/cluster_runs/${cluster.id}_baseline.json`;
  fs.writeFileSync(
    baselineFile,
    JSON.stringify(
      {
        at: new Date().toISOString(),
        cluster,
        gitPages: gitFamily.map((p) => p.name),
        baseline,
      },
      null,
      2
    )
  );

  // Clone VPS
  const token = GH.replace(/'/g, `'\\''`);
  const cloneCmd = `
set -e
REPO='${cluster.repo}'
PATH_LP='${cluster.vpsPath}'
TOKEN='${token}'
URL="https://x-access-token:\${TOKEN}@github.com/\${REPO}.git"
TS=$(date +%Y%m%d%H%M%S)
mkdir -p "$(dirname "$PATH_LP")"
BAK=""
if [ -d "$PATH_LP/.git" ]; then
  echo MODE=UPDATE
  git -C "$PATH_LP" remote set-url origin "$URL"
  git -C "$PATH_LP" fetch origin
  git -C "$PATH_LP" checkout main 2>/dev/null || git -C "$PATH_LP" checkout -B main origin/main
  git -C "$PATH_LP" reset --hard origin/main
  git -C "$PATH_LP" remote set-url origin "https://github.com/\${REPO}.git"
elif [ -d "$PATH_LP" ]; then
  BAK="\${PATH_LP}.bak-\$TS"
  mv "$PATH_LP" "$BAK"
  echo MODE=CLONE BAK="$BAK"
  git clone --depth 1 --branch main "$URL" "$PATH_LP" || git clone --depth 1 "$URL" "$PATH_LP"
  git -C "$PATH_LP" remote set-url origin "https://github.com/\${REPO}.git"
else
  echo MODE=FRESH
  git clone --depth 1 --branch main "$URL" "$PATH_LP" || git clone --depth 1 "$URL" "$PATH_LP"
  git -C "$PATH_LP" remote set-url origin "https://github.com/\${REPO}.git"
fi
test -d "$PATH_LP/.git"
printf 'machine github.com\\nlogin x-access-token\\npassword %s\\n' "$TOKEN" > /root/.netrc
chmod 600 /root/.netrc
echo CLONE_OK
echo BAK_PATH=$BAK
git -C "$PATH_LP" log -1 --oneline
`;

  const { out, err, code } = await ssh(cloneCmd);
  console.log(out.trim().split("\n").slice(-8).join("\n"));
  if (err && !out.includes("CLONE_OK")) console.error(err.slice(-400));
  if (code !== 0 || !out.includes("CLONE_OK")) {
    console.error("STOP on cluster", cluster.id, "— clone failed");
    summary.push({ id: cluster.id, status: "FAIL_CLONE", out: out.slice(-500) });
    fs.writeFileSync("data/cluster_runs/_SUMMARY.json", JSON.stringify(summary, null, 2));
    process.exit(2);
  }
  const bakMatch = out.match(/BAK_PATH=(.*)/);
  const backup = (bakMatch && bakMatch[1].trim()) || null;

  // Re-probe
  let mismatches = [];
  let after = [];
  if (withLink.length > 0) {
    await new Promise((r) => setTimeout(r, 1500));
    after = await pool(withLink, 8, async (row) => {
      const live = await probe(row.domain);
      return {
        domain: row.domain,
        pages: row.pages,
        before: row.link,
        after: live.link || "",
        match: normLink(row.link) === normLink(live.link),
        via: live.via,
      };
    });
    mismatches = after.filter((a) => !a.match);
  }

  const verifyFile = `data/cluster_runs/${cluster.id}_verify.json`;
  fs.writeFileSync(
    verifyFile,
    JSON.stringify(
      { at: new Date().toISOString(), backup, checked: after.length, mismatches, after },
      null,
      2
    )
  );

  if (mismatches.length) {
    console.error("STOP LIVE MISMATCH on", cluster.id, "count=", mismatches.length);
    for (const m of mismatches.slice(0, 10)) {
      console.error(" ", m.domain, m.before, "=>", m.after);
    }
    // attempt restore backup if we have one
    if (backup) {
      console.error("Attempting restore backup", backup);
      await ssh(`set -e; rm -rf '${cluster.vpsPath}'; mv '${backup}' '${cluster.vpsPath}'; echo RESTORED`);
    }
    summary.push({ id: cluster.id, status: "FAIL_LIVE_MISMATCH", mismatches: mismatches.length, backup });
    fs.writeFileSync("data/cluster_runs/_SUMMARY.json", JSON.stringify(summary, null, 2));
    process.exit(2);
  }

  console.log("OK", cluster.id, "| backup=", backup || "(updated existing git)", "| verified=", withLink.length);
  summary.push({
    id: cluster.id,
    status: "OK",
    repo: cluster.repo,
    vpsPath: cluster.vpsPath,
    backup,
    domainsVerified: withLink.length,
    baselineFile,
    verifyFile,
  });
  fs.writeFileSync("data/cluster_runs/_SUMMARY.json", JSON.stringify(summary, null, 2));
}

console.log("\nALL CLUSTERS OK", summary.length);
fs.writeFileSync("data/cluster_runs/_SUMMARY.json", JSON.stringify({ at: new Date().toISOString(), summary }, null, 2));
