const D = "gg88pr.com";
async function probeHost(host, label) {
  console.log("\n===", label, host, "===");
  for (const path of [`/domains.json?v=${Date.now()}`, `/?v=${Date.now()}`]) {
    try {
      const r = await fetch(`https://${host}${path}`, {
        redirect: "manual",
        headers: { "Cache-Control": "no-cache", "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(20000),
      });
      const loc = r.headers.get("location");
      const ct = r.headers.get("content-type") || "";
      let body = "";
      if (ct.includes("json")) {
        try {
          body = JSON.stringify(await r.json()).slice(0, 500);
        } catch {
          body = await r.text();
        }
      } else {
        body = (await r.text()).slice(0, 800);
      }
      const hits = [...new Set((body.match(/gg88\d+\.com[^"'\\s]*/gi) || []))].slice(0, 10);
      console.log(path, "status", r.status, "loc", loc, "hits", hits);
      if (path.includes("domains.json")) console.log("  json", body.slice(0, 400));
      else {
        const hrefs = [...new Set((body.match(/href=\"(https?:[^\"]+gg88[^\"]+)\"/gi) || []))].slice(0, 6);
        console.log("  hrefs", hrefs);
      }
    } catch (e) {
      console.log(path, "ERR", e.message);
    }
  }
}
await probeHost(D, "apex");
await probeHost(`www.${D}`, "www");
await probeHost("lp-gg88pr-git2.pages.dev", "pages-dev");
