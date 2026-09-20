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
const r = await fetch("https://api.github.com/repos/freze2212/gg88-lp-5uae/contents/domains.json?ref=main", {
  headers: { Authorization: `Bearer ${GH}`, Accept: "application/vnd.github+json", "User-Agent": "x" },
});
const meta = await r.json();
if (!r.ok) {
  console.log("GH err", r.status, meta);
  process.exit(1);
}
const dj = JSON.parse(Buffer.from(meta.content.replace(/\n/g, ""), "base64").toString());
const e = dj["autotest-6888.top"];
console.log("GH", typeof e === "string" ? e : e?.main_url, "sha", meta.sha?.slice(0, 7));
const commits = await fetch("https://api.github.com/repos/freze2212/gg88-lp-5uae/commits?per_page=5", {
  headers: { Authorization: `Bearer ${GH}`, Accept: "application/vnd.github+json", "User-Agent": "x" },
});
const cj = await commits.json();
console.log(
  cj.map((c) => ({ m: c.commit.message.split("\n")[0], t: c.commit.author.date, sha: c.sha.slice(0, 7) }))
);
for (let i = 0; i < 10; i++) {
  const live = await fetch("https://autotest-6888.top/domains.json?v=" + Date.now(), {
    headers: { "Cache-Control": "no-cache" },
  });
  const j = await live.json();
  const link = j["autotest-6888.top"]?.main_url || j["autotest-6888.top"];
  console.log("probe", i + 1, link);
  if (String(link).includes("switch_fix_C")) {
    console.log("LIVE_OK");
    break;
  }
  await new Promise((r) => setTimeout(r, 10000));
}
