import { addPagesDomain, setupDns, findZoneByName, cfRequest } from "../src/cloudflare.js";

async function run() {
  console.log("=== 1. Adding gg88pr.com to Pages project lp-gg88pr ===");
  const res = await addPagesDomain("gg88pr.com", "lp-gg88pr", "C:\\Landingpage\\lp-gg88pr");
  console.log("addPagesDomain result:", res);

  console.log("\n=== 2. Setting up DNS CNAME records for gg88pr.com ===");
  const dnsRes = await setupDns("gg88pr.com", "lp-gg88pr.pages.dev");
  console.log("setupDns result:", dnsRes);

  console.log("\n=== 3. Waiting 5s for Cloudflare edge routing ===");
  await new Promise((r) => setTimeout(r, 5000));

  console.log("\n=== 4. Testing Live HTTP Requests ===");
  for (const host of ["https://lp-gg88pr.pages.dev", "https://gg88pr.com", "https://www.gg88pr.com"]) {
    try {
      const response = await fetch(host, { headers: { "User-Agent": "Mozilla/5.0" } });
      const html = await response.text();
      console.log(`[${host}] Status: ${response.status} | Length: ${html.length} | Title: ${html.match(/<title>(.*?)<\/title>/i)?.[1]}`);
    } catch (e) {
      console.error(`[${host}] Error: ${e.message}`);
    }
  }
}

run().catch(console.error);
