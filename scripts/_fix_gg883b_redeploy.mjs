import { Client } from "ssh2";
const c = new Client();
c.on("ready", () => {
  c.exec(`
cd /var/www/web-ten-mien
node --input-type=module <<'NODE'
import fs from "fs";
for (const line of fs.readFileSync(".env","utf8").split(/\\n/)) {
  const t=line.trim(); if(!t||t.startsWith("#")||!t.includes("=")) continue;
  const i=t.indexOf("="); const k=t.slice(0,i).trim(); const v=t.slice(i+1).trim();
  if(!(k in process.env)) process.env[k]=v;
}

const token = process.env.CLOUDFLARE_API_TOKEN;
const freze = process.env.CLOUDFLARE_ACCOUNT_ID;
const h = { Authorization: "Bearer " + token, "Content-Type": "application/json" };

async function latestDeploy(proj) {
  const url = \`https://api.cloudflare.com/client/v4/accounts/\${freze}/pages/projects/\${proj}/deployments?per_page=3\`;
  const j = await (await fetch(url, { headers: h })).json();
  const deps = j.result || [];
  console.log("\\n===", proj, "deployments", deps.length);
  for (const d of deps) {
    console.log(
      d.created_on,
      d.latest_stage?.name,
      d.latest_stage?.status,
      "commit",
      d.deployment_trigger?.metadata?.commit_hash?.slice(0, 10),
      d.deployment_trigger?.metadata?.commit_message?.slice(0, 60)
    );
  }
  return deps[0];
}

for (const p of ["lp-gg88-vip-8", "lp-gg88-vip-2", "lp-gg88-vip"]) {
  await latestDeploy(p);
}

// Retry deployment of latest production for vip-8
async function retry(proj) {
  const listUrl = \`https://api.cloudflare.com/client/v4/accounts/\${freze}/pages/projects/\${proj}/deployments?per_page=1\`;
  const j = await (await fetch(listUrl, { headers: h })).json();
  const dep = j.result?.[0];
  if (!dep?.id) {
    console.log("no dep", proj);
    return;
  }
  // Prefer create deployment via retry endpoint
  const retryUrl = \`https://api.cloudflare.com/client/v4/accounts/\${freze}/pages/projects/\${proj}/deployments/\${dep.id}/retry\`;
  const r = await fetch(retryUrl, { method: "POST", headers: h });
  const body = await r.json();
  console.log("retry", proj, r.status, body.success, body.errors || body.result?.id || "");
}

await retry("lp-gg88-vip-8");
await retry("lp-gg88-vip-2");

// Also ensure custom domain on vip-8
async function ensureDomain(proj, domain) {
  const url = \`https://api.cloudflare.com/client/v4/accounts/\${freze}/pages/projects/\${proj}/domains\`;
  const list = await (await fetch(url, { headers: h })).json();
  const names = (list.result || []).map((x) => x.name);
  console.log(proj, "domains count", names.length, "has", domain, names.includes(domain));
  if (!names.includes(domain)) {
    const r = await fetch(url, { method: "POST", headers: h, body: JSON.stringify({ name: domain }) });
    const b = await r.json();
    console.log("add", domain, "->", proj, b.success, JSON.stringify(b.errors || b.result?.status));
  }
  if (!names.includes("www." + domain)) {
    const r = await fetch(url, { method: "POST", headers: h, body: JSON.stringify({ name: "www." + domain }) });
    const b = await r.json();
    console.log("add www", b.success, JSON.stringify(b.errors || b.result?.status));
  }
}
await ensureDomain("lp-gg88-vip-8", "gg883b.com");
NODE
`, (e,s)=>{ let o=""; s.on("data",d=>o+=d); s.stderr.on("data",d=>o+=d); s.on("close",()=>{console.log(o);c.end();});});
}).connect({host:"103.146.22.218",username:"root",password:"admin123@!"});
