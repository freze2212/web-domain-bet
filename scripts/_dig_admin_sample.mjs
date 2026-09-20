async function dig(d) {
  console.log("\n====", d);
  const r = await fetch("https://" + d + "/?t=" + Date.now(), {
    headers: { "cache-control": "no-cache", "user-agent": "Mozilla/5.0" },
  });
  const t = await r.text();
  console.log("status", r.status, "len", t.length, "final", r.url);
  console.log("title", (t.match(/<title>([^<]+)<\/title>/i) || [])[1]);
  const hrefs = [...t.matchAll(/href=["'](https?:\/\/[^"']+)["']/gi)].map((m) => m[1]);
  console.log("hrefs", [...new Set(hrefs)].slice(0, 20));
  for (const pat of ["REDIRECT_URL", "SITE_CONFIG", "main_url", "domains.json", "btn-register", "redirect-link"]) {
    const i = t.indexOf(pat);
    if (i >= 0) console.log("ctx", pat, JSON.stringify(t.slice(Math.max(0, i - 30), i + 90)));
  }
  const dj = await fetch("https://" + d + "/domains.json?t=" + Date.now());
  const jt = await dj.text();
  console.log("dj", dj.status, jt.slice(0, 160).replace(/\s+/g, " "));
}

for (const d of ["gg86.us", "mm88sin.top", "gg88us.net", "xoamaan.asia", "gg88bet.cc"]) {
  await dig(d);
}
