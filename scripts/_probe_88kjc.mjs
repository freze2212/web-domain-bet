const D = "88kjc.dev";
const TARGET = "https://gg8858.com/?id=633886974";

async function probeHost(host, label) {
  console.log(`\n=== ${label} (${host}) ===`);
  for (const path of [`/domains.json?v=${Date.now()}`, `/?v=${Date.now()}`]) {
    try {
      const r = await fetch(`https://${host}${path}`, {
        redirect: "manual",
        headers: { "Cache-Control": "no-cache", "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(25000),
      });
      const loc = r.headers.get("location") || "";
      const ct = r.headers.get("content-type") || "";
      let body = "";
      if (ct.includes("json")) {
        try {
          body = JSON.stringify(await r.json());
        } catch {
          body = await r.text();
        }
      } else {
        body = (await r.text()).slice(0, 2500);
      }
      const ggLinks = [...new Set((body.match(/https?:\/\/[^"'\\s<>]+/gi) || []))].filter((u) => /gg88/i.test(u));
      const matchTarget = body.includes("633886974") || body.includes("gg8858.com");
      console.log({ path, status: r.status, location: loc, matchTarget, ggLinks: ggLinks.slice(0, 12) });
      if (path.includes("domains.json")) console.log("  json:", body.slice(0, 500));
      else {
        const hrefs = [...new Set((body.match(/href="(https?:[^"]+)"/gi) || []))].slice(0, 8);
        console.log("  hrefs:", hrefs);
      }
    } catch (e) {
      console.log(path, "ERR", e.message);
    }
  }
}

console.log("TARGET:", TARGET);
await probeHost(D, "apex");
await probeHost(`www.${D}`, "www");
await probeHost("lp-gg88-vip-2.pages.dev", "pages-dev");
