import { addPagesDomain, ensurePagesCname } from "../src/cloudflare.js";

async function run() {
  console.log("=== 1. Adding gg88pr.com to Pages project lp-gg88pr ===");
  const addRes = await addPagesDomain("gg88pr.com", "lp-gg88pr", "C:\\Landingpage\\lp-gg88pr");
  console.log("addPagesDomain result:", JSON.stringify(addRes, null, 2));

  console.log("\n=== 2. Ensuring DNS CNAME for gg88pr.com ===");
  const cnameRes = await ensurePagesCname("gg88pr.com", "lp-gg88pr.pages.dev");
  console.log("ensurePagesCname result:", JSON.stringify(cnameRes, null, 2));

  console.log("\n=== 3. Waiting 6 seconds for DNS & Edge propagation ===");
  await new Promise((r) => setTimeout(r, 6000));

  console.log("\n=== 4. Testing Live URLs ===");
  for (const host of ["https://lp-gg88pr.pages.dev", "https://gg88pr.com", "https://www.gg88pr.com"]) {
    try {
      const res = await fetch(host, { headers: { "User-Agent": "Mozilla/5.0" } });
      const html = await res.text();
      const title = html.match(/<title>(.*?)<\/title>/i)?.[1];
      const hasCyber = html.includes("CYBER HACKER THEME");
      console.log(`[${host}] Status: ${res.status} | Length: ${html.length} | Has Cyber: ${hasCyber} | Title: "${title}"`);
    } catch (e) {
      console.error(`[${host}] Error: ${e.message}`);
    }
  }
}

run().catch(console.error);
