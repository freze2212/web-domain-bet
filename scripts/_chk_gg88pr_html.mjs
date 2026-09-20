import fs from "fs";

for (const line of fs.readFileSync(".env", "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const i = t.indexOf("=");
  process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const GH = process.env.GITHUB_TOKEN;
const REPO = "freze2212/lp-gg88pr";

const fr = await fetch(`https://api.github.com/repos/${REPO}/contents/index.html?ref=main`, {
  headers: { Authorization: `Bearer ${GH}`, Accept: "application/vnd.github+json", "User-Agent": "hub" },
});
const fj = await fr.json();
const gitHtml = Buffer.from(fj.content, "base64").toString("utf8");

const live = await fetch(`https://gg88pr.com/?v=${Date.now()}`, {
  headers: { "Cache-Control": "no-cache" },
  signal: AbortSignal.timeout(20000),
}).then((r) => r.text());

console.log("GITHUB 38:", (gitHtml.match(/gg8838/gi) || []).length, "26:", (gitHtml.match(/gg8826/gi) || []).length);
console.log("LIVE 38:", (live.match(/gg8838/gi) || []).length, "26:", (live.match(/gg8826/gi) || []).length);

for (const label of ["GITHUB", "LIVE"]) {
  const html = label === "GITHUB" ? gitHtml : live;
  const lines = html.split("\n").filter((l) => /gg8838/i.test(l));
  if (lines.length) {
    console.log(`\n${label} lines with gg8838:`);
    for (const l of lines.slice(0, 8)) console.log(" ", l.trim().slice(0, 120));
  }
}

const hrefs = [...live.matchAll(/href=["']([^"']*gg88[^"']*)["']/gi)].map((m) => m[1]);
console.log("\nLIVE hrefs with gg88:", [...new Set(hrefs)].slice(0, 10));
