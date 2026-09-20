import fs from "fs";
for (const line of fs.readFileSync(".env", "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const i = t.indexOf("=");
  process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}
const tok = process.env.GITHUB_TOKEN;
if (!tok) {
  console.log("NO GITHUB_TOKEN local");
  process.exit(1);
}
const r = await fetch("https://api.github.com/repos/freze2212/lp-gg88pr/contents/domains.json?ref=main", {
  headers: { Authorization: `Bearer ${tok}`, Accept: "application/vnd.github+json", "User-Agent": "hub" },
});
const meta = await r.json();
console.log("gh status", r.status, meta.message || "ok");
if (!meta.content) process.exit(1);
const dj = JSON.parse(Buffer.from(meta.content, "base64").toString("utf8"));
console.log("gg88pr.com", dj["gg88pr.com"]);
console.log("www.gg88pr.com", dj["www.gg88pr.com"]);
console.log(
  "gg8838 entries",
  Object.entries(dj).filter(([k, v]) => String(v?.main_url || v).includes("gg8838")).length
);
console.log(
  "gg8826 entries",
  Object.entries(dj).filter(([k, v]) => String(v?.main_url || v).includes("gg8826")).length
);
