import { Client } from "ssh2";
const c = new Client();
c.on("ready", () => {
  c.exec(
    `
cd /var/www/web-ten-mien
node --input-type=module <<'NODE'
import fs from "fs";
for (const line of fs.readFileSync(".env","utf8").split(/\\n/)) {
  const t=line.trim(); if(!t||t.startsWith("#")||!t.includes("=")) continue;
  const i=t.indexOf("="); const k=t.slice(0,i).trim(); let v=t.slice(i+1).trim();
  if ((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'"))) v=v.slice(1,-1);
  process.env[k]=v;
}
const token=process.env.CLOUDFLARE_API_TOKEN;
const acc=process.env.CLOUDFLARE_ACCOUNT_ID;
const gh=process.env.GITHUB_TOKEN;
const name="lp-7f-llwin-defr";
const sibling=await (await fetch("https://api.cloudflare.com/client/v4/accounts/"+acc+"/pages/projects/lp-7f-llwin-games",{headers:{Authorization:"Bearer "+token}})).json();
const cfg=sibling.result?.source?.config||{};
const repo=await (await fetch("https://api.github.com/repos/freze2212/lp-7f-llwin-defr",{headers:{Authorization:"Bearer "+gh,Accept:"application/vnd.github+json","User-Agent":"hub"}})).json();
console.log("repo id", repo.id, "owner", repo.owner?.id, repo.owner?.login);

const body={
  production_branch:"main",
  source:{
    type:"github",
    config:{
      owner: repo.owner?.login || "freze2212",
      owner_id: repo.owner?.id || cfg.owner_id,
      repo_name: "lp-7f-llwin-defr",
      repo_id: repo.id,
      production_branch: "main",
      deployments_enabled: true,
      production_deployments_enabled: true,
      pr_comments_enabled: false,
      preview_deployment_setting: "none",
      preview_branch_includes: ["*"],
      preview_branch_excludes: [],
      path_includes: ["*"],
      path_excludes: [],
    }
  }
};
const patch=await fetch("https://api.cloudflare.com/client/v4/accounts/"+acc+"/pages/projects/"+name,{
  method:"PATCH",
  headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},
  body:JSON.stringify(body),
}).then(r=>r.json());
console.log("patch", patch.success, JSON.stringify(patch.errors||patch.result?.source||{}).slice(0,400));

const meta=await (await fetch("https://api.cloudflare.com/client/v4/accounts/"+acc+"/pages/projects/"+name,{headers:{Authorization:"Bearer "+token}})).json();
console.log("final source", meta.result?.source?.type, meta.result?.source?.config?.owner+"/"+meta.result?.source?.config?.repo_name);
NODE
`,
    (e, s) => {
      let o = "";
      s.on("data", (d) => (o += d));
      s.stderr.on("data", (d) => (o += d));
      s.on("close", () => {
        console.log(o);
        c.end();
      });
    }
  );
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
