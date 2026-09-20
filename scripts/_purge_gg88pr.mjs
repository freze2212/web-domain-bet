import fs from "fs";

for (const line of fs.readFileSync(".env", "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const i = t.indexOf("=");
  process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const FT = process.env.CLOUDFLARE_API_TOKEN;
const zid = "93ddabdfd240f7967abce91468aee6c5";

const purge = await fetch(`https://api.cloudflare.com/client/v4/zones/${zid}/purge_cache`, {
  method: "POST",
  headers: { Authorization: `Bearer ${FT}`, "Content-Type": "application/json" },
  body: JSON.stringify({ purge_everything: true }),
}).then((r) => r.json());
console.log("purge", purge.success, purge.errors?.[0]?.message || "ok");

await new Promise((r) => setTimeout(r, 10000));

for (const host of ["gg88pr.com", "www.gg88pr.com", "lp-gg88pr-git2.pages.dev"]) {
  const hr = await fetch(`https://${host}/?v=${Date.now()}`, {
    headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    signal: AbortSignal.timeout(20000),
  });
  const html = await hr.text();
  console.log(
    host,
    "status",
    hr.status,
    "38",
    (html.match(/gg8838/gi) || []).length,
    "26",
    (html.match(/gg8826/gi) || []).length,
    "loader",
    html.includes("hub-domains-json-loader") ? "YES" : "NO",
  );
  const m = html.match(/window\.REDIRECT_URL\s*=\s*["']([^"']*)["']/);
  console.log(" ", "REDIRECT_URL", m ? m[1] || "(empty)" : "(none)");
}
