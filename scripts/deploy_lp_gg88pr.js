import { exec } from "node:child_process";
import { promisify } from "node:util";
import { config } from "../src/config.js";

const execAsync = promisify(exec);
const accountId = config.cloudflare.accountId();
const token = config.cloudflare.token();
const projectName = "lp-gg88pr";
const dirPath = "C:\\Landingpage\\lp-gg88pr";
const headers = { Authorization: "Bearer " + token, "Content-Type": "application/json" };

async function run() {
  console.log("1. Checking / Creating Cloudflare Pages Project:", projectName);
  const pCheck = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${projectName}`, { headers });
  const pCheckData = await pCheck.json();
  if (!pCheckData.success) {
    console.log("Creating project...");
    const pCreate = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: projectName,
        production_branch: "main",
      }),
    });
    const createData = await pCreate.json();
    console.log("Project create result:", createData.success, createData.errors);
  } else {
    console.log("Project already exists.");
  }

  console.log("2. Deploying via wrangler pages deploy...");
  try {
    const { stdout, stderr } = await execAsync(
      `npx -y wrangler pages deploy "${dirPath}" --project-name="${projectName}" --commit-dirty=true`,
      {
        env: {
          ...process.env,
          CLOUDFLARE_API_TOKEN: token,
          CLOUDFLARE_ACCOUNT_ID: accountId,
        },
      }
    );
    console.log("Deploy stdout:\n", stdout);
    if (stderr) console.error("Deploy stderr:\n", stderr);
  } catch (err) {
    console.error("Wrangler deploy error:", err.message, err.stdout, err.stderr);
  }

  console.log("3. Adding custom domains gg88pr.com and www.gg88pr.com to Pages project...");
  for (const domain of ["gg88pr.com", "www.gg88pr.com"]) {
    const cdRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${projectName}/domains`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: domain }),
    });
    const cdData = await cdRes.json();
    console.log(`Add domain ${domain}:`, cdData.success ? "SUCCESS" : JSON.stringify(cdData.errors));
  }

  console.log("4. Checking / Updating DNS records in Zone gg88pr.com...");
  const zoneId = "93ddabdfd240f7967abce91468aee6c5";
  const dnsRes = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`, { headers });
  const dnsData = await dnsRes.json();
  const targetCname = `${projectName}.pages.dev`;

  for (const rec of (dnsData.result || [])) {
    if (["gg88pr.com", "www.gg88pr.com"].includes(rec.name) && rec.type === "CNAME") {
      if (rec.content !== targetCname) {
        console.log(`Updating DNS ${rec.name} (${rec.id}) from ${rec.content} to ${targetCname}...`);
        const uRes = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${rec.id}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({
            content: targetCname,
            proxied: true,
          }),
        });
        const uData = await uRes.json();
        console.log(`DNS update result for ${rec.name}:`, uData.success);
      } else {
        console.log(`DNS ${rec.name} already points to ${targetCname}`);
      }
    }
  }

  console.log("5. Waiting 3s and testing Live URLs...");
  await new Promise((r) => setTimeout(r, 3000));

  for (const url of ["https://lp-gg88pr.pages.dev", "https://gg88pr.com"]) {
    try {
      const res = await fetch(url);
      const text = await res.text();
      console.log(`Fetch ${url} -> status: ${res.status}, length: ${text.length}, title included: ${text.includes("Cổng GG88 chính thức")}`);
    } catch (e) {
      console.error(`Fetch ${url} error: ${e.message}`);
    }
  }
}

run().catch(console.error);
