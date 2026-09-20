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
const h = { Authorization: "Bearer " + token };
const want = "https://www.gg8847.com/?id=150112380";

async function status(proj) {
  const j = await (await fetch(\`https://api.cloudflare.com/client/v4/accounts/\${freze}/pages/projects/\${proj}/deployments?per_page=1\`, { headers: h })).json();
  const d = j.result?.[0];
  return d ? {
    stage: d.latest_stage?.name,
    status: d.latest_stage?.status,
    commit: d.deployment_trigger?.metadata?.commit_hash?.slice(0,10),
    msg: d.deployment_trigger?.metadata?.commit_message?.slice(0,40),
  } : null;
}

async function liveLink() {
  try {
    const j = await (await fetch("https://www.gg883b.com/domains.json?v="+Date.now(), {
      headers: { "user-agent": "Mozilla/5.0", "cache-control": "no-cache" },
      signal: AbortSignal.timeout(15000),
    })).json();
    const e = j["gg883b.com"] || j["www.gg883b.com"];
    return e?.main_url || null;
  } catch (e) {
    return "err:" + e.message;
  }
}

for (let i = 0; i < 24; i++) {
  const s8 = await status("lp-gg88-vip-8");
  const link = await liveLink();
  console.log("#"+i, "vip8", JSON.stringify(s8), "live", link);
  if (s8?.status === "success" && s8?.commit?.startsWith("52da19a") && link === want) {
    console.log("LIVE_OK");
    break;
  }
  if (s8?.status === "failure") {
    console.log("DEPLOY_FAIL");
    break;
  }
  await new Promise((r) => setTimeout(r, 10000));
}
NODE
`, (e,s)=>{ let o=""; s.on("data",d=>o+=d); s.stderr.on("data",d=>o+=d); s.on("close",()=>{console.log(o);c.end();});});
}).connect({host:"103.146.22.218",username:"root",password:"admin123@!"});
