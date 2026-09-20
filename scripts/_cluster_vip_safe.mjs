/**
 * ONE cluster only: lp-gg88-vip (Pages vip / vip-2 / vip-7 → repo freze2212/lp-gg88-vip)
 * Protocol: baseline live → (optional GH already aligned) → clone VPS path → re-probe → STOP on mismatch.
 */
import fs from "fs";
import { Client } from "ssh2";
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
const REPO = "freze2212/lp-gg88-vip";
const VPS_PATH = "/var/www/Landingpages/GG88/ldpape_4d";
const PAGES_PREFIX = "lp-gg88-vip"; // only this family

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
    if (r.status >= 300 && r.status < 400 && loc && !loc.includes(domain)) {
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
    Array.from({ length: n }, async () => {
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
      .connect({ host: "103.146.22.218", username: "root", password: VPS_PASS, readyTimeout: 30000 });
  });
}

console.log("=== CLUSTER: lp-gg88-vip ONLY ===");

// 1) Domains on vip family Pages that are GIT + correct repo
const all = await getAllPagesProjectsForAccount(config.cloudflare.accountId());
const family = (all || []).filter(
  (p) => p.name === PAGES_PREFIX || p.name.startsWith(PAGES_PREFIX + "-")
);
const acc = config.cloudflare.accountId();
const domains = [];
for (const p of family) {
  const full = await cfRequest(`/accounts/${acc}/pages/projects/${encodeURIComponent(p.name)}`);
  const typ = (full?.source?.type || "").toLowerCase();
  const repo = full?.source?.config
    ? `${full.source.config.owner}/${full.source.config.repo_name}`
    : null;
  if (typ !== "github" && typ !== "gitlab") {
    console.error("STOP: Pages", p.name, "is not GIT:", typ || "direct");
    process.exit(2);
  }
  if (repo !== REPO) {
    console.error("STOP: Pages", p.name, "repo mismatch:", repo, "expected", REPO);
    process.exit(2);
  }
  for (const d of full.domains || []) {
    const name = String(d.name || d)
      .toLowerCase()
      .replace(/^www\./, "");
    if (!name.endsWith(".pages.dev")) domains.push({ domain: name, pages: p.name });
  }
}
const uniq = [...new Map(domains.map((d) => [d.domain, d])).values()];
console.log("Pages:", family.map((p) => p.name).join(", "));
console.log("Custom domains:", uniq.length);

// 2) Baseline probe
console.log("Baseline probe...");
const baseline = await pool(uniq, 8, async (row) => {
  const live = await probe(row.domain);
  return { ...row, ...live };
});
const withLink = baseline.filter((b) => b.ok && b.link);
const noLink = baseline.filter((b) => !b.link);
console.log("With live link:", withLink.length, "| no/clear link:", noLink.length);

fs.writeFileSync(
  "data/_cluster_vip_baseline.json",
  JSON.stringify({ at: new Date().toISOString(), repo: REPO, baseline }, null, 2)
);

if (withLink.length < 10) {
  console.error("STOP: too few probeable live links — abort clone");
  process.exit(2);
}

// 3) Clone ONLY this path on VPS
console.log("Cloning VPS path", VPS_PATH, "←", REPO);
const token = GH.replace(/'/g, "'\\''");
const cloneCmd = `
set -e
REPO='${REPO}'
PATH_LP='${VPS_PATH}'
TOKEN='${token}'
URL="https://x-access-token:\${TOKEN}@github.com/\${REPO}.git"
TS=$(date +%Y%m%d%H%M%S)

# safety: only touch this exact path
if [ ! -d "$(dirname "$PATH_LP")" ]; then echo "STOP parent missing"; exit 3; fi

if [ -d "$PATH_LP/.git" ]; then
  echo "ALREADY_GIT — fetch reset"
  git -C "$PATH_LP" remote set-url origin "$URL"
  git -C "$PATH_LP" fetch origin
  git -C "$PATH_LP" checkout main
  git -C "$PATH_LP" reset --hard origin/main
  git -C "$PATH_LP" remote set-url origin "https://github.com/\${REPO}.git"
  echo CLONE_OK
else
  if [ -d "$PATH_LP" ]; then
    mv "$PATH_LP" "\${PATH_LP}.bak-\$TS"
    echo "BACKED_UP \${PATH_LP}.bak-\$TS"
  fi
  git clone --depth 1 --branch main "$URL" "$PATH_LP"
  git -C "$PATH_LP" remote set-url origin "https://github.com/\${REPO}.git"
  test -d "$PATH_LP/.git"
  echo CLONE_OK
fi

# netrc for push later
printf 'machine github.com\\nlogin x-access-token\\npassword %s\\n' "$TOKEN" > /root/.netrc
chmod 600 /root/.netrc
test -f "$PATH_LP/domains.json" && echo HAS_DOMAINS_JSON
`;

const { out, err, code } = await ssh(cloneCmd);
console.log(out);
if (err) console.error(err);
if (code !== 0 || !out.includes("CLONE_OK")) {
  console.error("STOP: clone failed, code", code);
  process.exit(2);
}

// 4) Re-probe — must match baseline for domains that had links
console.log("Re-probe after clone (live must be unchanged)...");
await new Promise((r) => setTimeout(r, 3000));
const after = await pool(withLink, 8, async (row) => {
  const live = await probe(row.domain);
  return {
    domain: row.domain,
    before: row.link,
    after: live.link || "",
    via: live.via,
    match: normLink(row.link) === normLink(live.link),
  };
});

const mismatches = after.filter((a) => !a.match);
fs.writeFileSync(
  "data/_cluster_vip_verify.json",
  JSON.stringify({ at: new Date().toISOString(), checked: after.length, mismatches, after }, null, 2)
);

console.log("Checked:", after.length, "| mismatches:", mismatches.length);
if (mismatches.length) {
  console.error("STOP: LIVE LINK CHANGED — do not continue other clusters");
  for (const m of mismatches.slice(0, 20)) {
    console.error(m.domain, "before=", m.before, "after=", m.after);
  }
  process.exit(2);
}

console.log("OK CLUSTER vip: live links unchanged after VPS git clone");
console.log("Next: only after you confirm, do another LP cluster.");
