import { config } from "../src/config.js";

async function detachPages() {
  const token = config.cloudflare.token();
  const accountId = config.cloudflare.accountId();

  console.log("Fetching Cloudflare Pages projects...");
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  for (const proj of (data.result || [])) {
    const domRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${proj.name}/domains`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const domData = await domRes.json();
    const matches = (domData.result || []).filter(d => d.name.includes("tenmienbet.top"));
    if (matches.length > 0) {
      console.log(`Found in project ${proj.name}:`, matches.map(m => m.name));
      for (const m of matches) {
        console.log(`Deleting custom domain ${m.name} from Pages project ${proj.name}...`);
        const delRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${proj.name}/domains/${m.name}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` }
        });
        const delData = await delRes.json();
        console.log("Delete result:", delData.success ? "✅ Success" : delData.errors);
      }
    }
  }

  // Also purge Cloudflare Cache for the zone
  const ZONE_ID = "db305089ff3d3093588005d0e7382845";
  console.log("Purging Cloudflare Cache for zone tenmienbet.top...");
  const purgeRes = await fetch(`https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/purge_cache`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ purge_everything: true })
  });
  console.log("Purge cache result:", await purgeRes.json());
}

detachPages();
