import dns from "dns/promises";

dns.setServers(["1.1.1.1", "8.8.8.8"]);

for (const h of ["gg88qt.com", "www.gg88qt.com"]) {
  try {
    console.log("NS", h, await dns.resolveNs(h));
  } catch (e) {
    console.log("NS", h, e.code);
  }
  try {
    console.log("A", h, await dns.resolve4(h));
  } catch (e) {
    console.log("A", h, e.code);
  }
  try {
    console.log("CNAME", h, await dns.resolveCname(h));
  } catch (e) {
    console.log("CNAME", h, e.code);
  }
}

async function fp(d) {
  const r = await fetch("https://" + d + "/", { headers: { "cache-control": "no-cache" } });
  const t = await r.text();
  const title = (t.match(/<title>([^<]+)<\/title>/i) || [])[1];
  const hasRedirect = /REDIRECT_URL|domains\.json|main_url/.test(t);
  console.log(
    JSON.stringify({
      d,
      status: r.status,
      title,
      len: t.length,
      hasRedirect,
      cf: r.headers.get("cf-ray"),
    })
  );
}

await fp("gg88qt.com");
await fp("88de.top");
await fp("autotest-6888.top");
