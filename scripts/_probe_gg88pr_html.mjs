const hosts = ["gg88pr.com", "lp-gg88pr-git2.pages.dev"];
for (const host of hosts) {
  console.log("\n===", host, "===");
  const r = await fetch(`https://${host}/?v=${Date.now()}`, {
    headers: { "Cache-Control": "no-cache", "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(20000),
  });
  const t = await r.text();
  console.log("status", r.status, "len", t.length);
  const hits = [...new Set((t.match(/gg88[0-9]+\\.com[^"'\\s<>]*/gi) || []))];
  console.log("gg88 links in HTML", hits);
  for (const kw of ["defaultLink", "REDIRECT_URL", "registerUrl", "main_url", "gg8838", "gg8826", "domains.json"]) {
    const i = t.indexOf(kw);
    if (i >= 0) console.log(kw, "...", t.slice(Math.max(0, i - 20), i + 100).replace(/\s+/g, " "));
  }
  // list script src
  const scripts = [...t.matchAll(/<script[^>]+src=\"([^\"]+)\"/gi)].map((m) => m[1]);
  console.log("scripts", scripts.slice(0, 10));
}
