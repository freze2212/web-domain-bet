import fs from "fs";

for (const line of fs.readFileSync(".env", "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const i = t.indexOf("=");
  const k = t.slice(0, i).trim();
  const v = t.slice(i + 1).trim();
  if (!(k in process.env)) process.env[k] = v;
}

const GH = process.env.GITHUB_TOKEN;
const h = {
  Authorization: `Bearer ${GH}`,
  Accept: "application/vnd.github+json",
  "User-Agent": "link-audit",
};

function linkOf(e) {
  if (!e) return "";
  if (typeof e === "string") return e;
  return e.main_url || e.url || e.link || "";
}

const since = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
const cr = await fetch(
  `https://api.github.com/repos/freze2212/gg88-lp-5uae/commits?since=${encodeURIComponent(since)}&per_page=50`,
  { headers: h }
);
const commits = await cr.json();
if (!Array.isArray(commits)) {
  console.log("API_ERR", cr.status, commits);
  process.exit(1);
}

console.log("COMMITS_SINCE", since, "count", commits.length);
for (const c of commits) {
  console.log("-", c.sha.slice(0, 7), c.commit.author.date, c.commit.message.split("\n")[0]);
}

if (!commits.length) {
  console.log("NO_COMMITS_IN_WINDOW");
  process.exit(0);
}

const oldest = commits[commits.length - 1].sha;
const oldestDetail = await (
  await fetch(`https://api.github.com/repos/freze2212/gg88-lp-5uae/commits/${oldest}`, { headers: h })
).json();
const beforeSha = oldestDetail.parents?.[0]?.sha || oldest;

async function getDj(ref) {
  const r = await fetch(
    `https://api.github.com/repos/freze2212/gg88-lp-5uae/contents/domains.json?ref=${ref}`,
    { headers: h }
  );
  const j = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(j));
  return JSON.parse(Buffer.from(j.content.replace(/\n/g, ""), "base64").toString("utf8"));
}

const before = await getDj(beforeSha);
const after = await getDj("main");
const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
const seen = new Set();
const changed = [];
for (const k of keys) {
  const a = k.replace(/^www\./, "");
  if (seen.has(a)) continue;
  seen.add(a);
  const bLink = linkOf(before[a] || before[`www.${a}`]);
  const aLink = linkOf(after[a] || after[`www.${a}`]);
  if (bLink !== aLink) changed.push({ domain: a, before: bLink || null, after: aLink || null });
}

const out = {
  at: new Date().toISOString(),
  since,
  beforeSha: beforeSha.slice(0, 7),
  commitCount: commits.length,
  changedCount: changed.length,
  changed,
};
fs.writeFileSync("data/_audit_links_last_3h_5uae.json", JSON.stringify(out, null, 2));
console.log("BEFORE_SHA", beforeSha.slice(0, 7));
console.log("CHANGED_COUNT", changed.length);
console.log(JSON.stringify(changed, null, 2));
